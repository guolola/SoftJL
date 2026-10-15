// Distributes a dependency-free verifier; evidence is rechecked on every execution.
export const implementationVerifierSource = String.raw`// Checks local evidence against a freshly downloaded UML implementation snapshot.
import { createHash } from 'node:crypto';
import { readFile, realpath, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const text = (value) => typeof value === 'string' && value.trim().length > 0;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = (value) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const stable = (value) => JSON.stringify(canonical(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
const sameSet = (left, right) => stable([...left].sort()) === stable([...right].sort());
const designKey = (ref) => stable([ref.artifactId, ref.modelId ?? null, ref.diagramKind, ref.elementKind, ref.elementId]);
const issue = (code, message, severity = 'blocking') => ({ code, severity, message });
const unique = (values, key = (value) => value) => new Set(values.map(key)).size === values.length;
const strings = (value) => Array.isArray(value) && value.every(text) && unique(value);
const fields = (value, required, optional = []) => object(value) && required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const validScope = (value) => fields(value, ['requirementIds', 'artifactIds']) && strings(value.requirementIds) && strings(value.artifactIds);
const validList = (value, predicate, key) => Array.isArray(value) && value.every(predicate) && unique(value, key);
function validVersion(value) {
  return fields(value, ['artifactId', 'contentHash', 'inputFingerprint', 'freshness']) &&
    text(value.artifactId) && text(value.contentHash) && (value.inputFingerprint === null || typeof value.inputFingerprint === 'string') &&
    ['current', 'stale', 'unknown'].includes(value.freshness);
}
function validDesign(value) {
  return fields(value, ['artifactId', 'diagramKind', 'elementId', 'elementKind', 'label'], ['modelId']) &&
    ['artifactId', 'diagramKind', 'elementId', 'elementKind', 'label'].every((key) => text(value[key])) &&
    (value.modelId === undefined || text(value.modelId));
}
function validTask(value) {
  return fields(value, ['id', 'title', 'requirementIds', 'sourceArtifactIds', 'designRefs', 'acceptanceCriteria', 'dependsOnTaskIds', 'issues', 'guidance']) &&
    text(value.id) && text(value.title) && strings(value.requirementIds) && strings(value.sourceArtifactIds) &&
    validList(value.designRefs, validDesign, designKey) && strings(value.dependsOnTaskIds) &&
    validList(value.acceptanceCriteria, (criterion) => fields(criterion, ['id', 'text', 'sourceArtifactId']) &&
      text(criterion.id) && text(criterion.text) && text(criterion.sourceArtifactId), (criterion) => criterion.id) &&
    Array.isArray(value.issues) && value.issues.every((item) => fields(item, ['code', 'severity', 'message']) &&
      text(item.code) && text(item.message) && ['warning', 'blocking'].includes(item.severity)) &&
    Array.isArray(value.guidance) && value.guidance.every(text);
}
function validRef(value, kind) {
  const required = kind === 'test' ? ['path', 'contentHash', 'criterionIds'] : ['path', 'contentHash'];
  const optional = kind === 'test' ? ['testName'] : kind === 'code' ? ['symbol'] : [];
  return fields(value, required, optional) && text(value.path) && /^sha256:[a-fA-F0-9]{64}$/.test(value.contentHash) &&
    optional.every((key) => value[key] === undefined || text(value[key])) && (kind !== 'test' || strings(value.criterionIds));
}
const boundedOptional = (value, minimum, maximum) => value === undefined || (Number.isInteger(value) && value >= minimum && value <= maximum);
function validEntry(value) {
  return fields(value, ['taskId', 'requirementIds', 'designRefs', 'sourceVersions', 'status', 'plannedTargets', 'actualRefs', 'testRefs', 'checks'], ['inputRefs']) &&
    text(value.taskId) && strings(value.requirementIds) && validList(value.designRefs, validDesign, designKey) &&
    validList(value.sourceVersions, validVersion, (version) => version.artifactId) && ['planned', 'implemented'].includes(value.status) &&
    validList(value.plannedTargets, (target) => fields(target, ['path', 'responsibility']) && text(target.path) && text(target.responsibility), (target) => target.path) &&
    validList(value.actualRefs, (ref) => validRef(ref, 'code'), (ref) => stable([ref.path, ref.symbol])) &&
    (value.inputRefs === undefined || validList(value.inputRefs, (ref) => validRef(ref, 'input'), (ref) => ref.path)) &&
    validList(value.testRefs, (ref) => validRef(ref, 'test'), (ref) => stable([ref.path, ref.testName])) &&
    validList(value.checks, (check) => fields(check, ['id', 'kind', 'command', 'args', 'criterionIds'], ['timeoutMs', 'maxOutputBytes']) &&
      text(check.id) && ['engineering', 'behavior'].includes(check.kind) && text(check.command) && !/[\r\n\0]/.test(check.command) &&
      Array.isArray(check.args) && check.args.every((arg) => typeof arg === 'string' && !arg.includes('\0')) && strings(check.criterionIds) &&
      boundedOptional(check.timeoutMs, 1000, 600000) && boundedOptional(check.maxOutputBytes, 1024, 4194304), (check) => check.id);
}

// Resolve wire references before the existing semantic checks. Missing/duplicate indices fail closed.
function expandInput(value, kind) {
  const header = ['version', 'projectId', 'scope', 'contextVersion'];
  const resolve = (indices, pool) => {
    if (!Array.isArray(pool) || !Array.isArray(indices) || !unique(indices) ||
        indices.some((index) => !Number.isInteger(index) || index < 0 || index >= pool.length))
      throw new Error('Invalid shared reference');
    return indices.map((index) => pool[index]);
  };
  if (value?.version !== 2) throw new Error('Expected wire format version 2');
  if (kind === 'snapshot') {
    if (!fields(value, [...header, 'manifest', 'shared', 'tasks']) || !Array.isArray(value.tasks) ||
        !fields(value.shared, ['sourceArtifactIds', 'designRefs', 'issues', 'guidance']) ||
        !strings(value.shared.sourceArtifactIds) || !validList(value.shared.designRefs, validDesign, designKey) ||
        !Array.isArray(value.shared.issues) || !value.shared.issues.every((item) => fields(item, ['code', 'severity', 'message']) &&
          text(item.code) && text(item.message) && ['warning', 'blocking'].includes(item.severity)) ||
        !Array.isArray(value.shared.guidance) || !value.shared.guidance.every(text)) throw new Error('Invalid snapshot pools');
    const { shared, tasks, ...snapshot } = value;
    return { ...snapshot, tasks: tasks.map((task) => {
      if (!fields(task, ['id', 'title', 'requirementIds', 'sourceRefs', 'designRefs', 'acceptanceCriteria', 'dependsOnTaskIds', 'issueRefs', 'guidanceRefs']))
        throw new Error('Invalid compact task');
      const { sourceRefs, designRefs, issueRefs, guidanceRefs, ...rest } = task;
      return { ...rest, sourceArtifactIds: resolve(sourceRefs, shared.sourceArtifactIds),
        designRefs: resolve(designRefs, shared.designRefs), issues: resolve(issueRefs, shared.issues), guidance: resolve(guidanceRefs, shared.guidance) };
    }) };
  }
  if (!fields(value, [...header, 'sourceVersions', 'entries']) || !Array.isArray(value.entries) ||
      !Array.isArray(value.sourceVersions) || !value.sourceVersions.every(validVersion)) throw new Error('Invalid report pools');
  const { sourceVersions, entries, ...report } = value;
  return { ...report, entries: entries.map((entry) => {
    if (!fields(entry, ['taskId', 'requirementIds', 'designRefs', 'sourceVersionRefs', 'status', 'plannedTargets', 'actualRefs', 'testRefs', 'checks'], ['inputRefs']))
      throw new Error('Invalid compact entry');
    const { sourceVersionRefs, ...rest } = entry;
    return { ...rest, sourceVersions: resolve(sourceVersionRefs, sourceVersions) };
  }) };
}
function validateInputs(snapshot, report) {
  const problems = [];
  const snapshotValid = fields(snapshot, ['version', 'projectId', 'scope', 'contextVersion', 'manifest', 'tasks']) && snapshot.version === 2 &&
    text(snapshot.projectId) && validScope(snapshot.scope) && text(snapshot.contextVersion) &&
    validList(snapshot.manifest, validVersion, (version) => version.artifactId) && validList(snapshot.tasks, validTask, (task) => task.id);
  const reportValid = fields(report, ['version', 'projectId', 'scope', 'contextVersion', 'entries']) && report.version === 2 &&
    text(report.projectId) && validScope(report.scope) && text(report.contextVersion) && validList(report.entries, validEntry, (entry) => entry.taskId);
  if (!snapshotValid) problems.push(issue('invalid_snapshot', 'Snapshot fields, values or unique IDs are invalid.'));
  if (!reportValid) problems.push(issue('invalid_report', 'Report fields, values or unique IDs are invalid.'));
  if (problems.length) return problems;
  const artifacts = new Set(snapshot.manifest.map((version) => version.artifactId));
  const taskIds = new Set(snapshot.tasks.map((task) => task.id));
  if (!unique(snapshot.tasks.flatMap((task) => task.acceptanceCriteria.map((criterion) => criterion.id))))
    problems.push(issue('duplicate_criterion', 'Acceptance criterion IDs must be globally unique.'));
  if (!snapshot.tasks.length) problems.push(issue('no_tasks', 'An empty snapshot cannot establish an implementation.'));
  if (snapshot.manifest.some((version) => version.artifactId.startsWith('implementation:')))
    problems.push(issue('derived_source', 'Derived implementation artifacts cannot be source versions.'));
  for (const task of snapshot.tasks) {
    if (!task.sourceArtifactIds.length || task.sourceArtifactIds.some((id) => !artifacts.has(id)) ||
        task.designRefs.some((ref) => !task.sourceArtifactIds.includes(ref.artifactId)) ||
        task.acceptanceCriteria.some((criterion) => !task.sourceArtifactIds.includes(criterion.sourceArtifactId)))
      problems.push(issue('invalid_task_source', 'Task ' + task.id + ' references a missing source artifact.'));
    if (task.dependsOnTaskIds.some((id) => !taskIds.has(id)))
      problems.push(issue('invalid_dependency', 'Task ' + task.id + ' has an invalid dependency.'));
  }
  if (report.entries.some((entry) => !taskIds.has(entry.taskId))) problems.push(issue('unknown_task', 'Report includes a task outside this snapshot.'));
  if (snapshot.projectId !== report.projectId || !sameSet(snapshot.scope.requirementIds, report.scope.requirementIds) ||
      !sameSet(snapshot.scope.artifactIds, report.scope.artifactIds)) problems.push(issue('context_binding', 'Report project or scope does not match the snapshot.'));
  return problems;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
}
function relativePath(value) {
  return text(value) && value === value.trim() && !path.isAbsolute(value) && !path.win32.isAbsolute(value) &&
    !/[\\:<>"|?*\u0000-\u001f\u007f]/.test(value) &&
    !value.split('/').some((part) => !part || part === '..' || part === '.' || /[. ]$/.test(part) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9]|conin\$|conout\$)(?:\.|$)/i.test(part));
}
async function resolveFile(root, relative) {
  if (!relativePath(relative)) throw new Error('Use a repository-relative file path without traversal: ' + relative);
  const resolved = await realpath(path.resolve(root, relative.replaceAll('\\', path.sep)));
  if (!inside(root, resolved)) throw new Error('File escapes the repository through a symlink or junction: ' + relative);
  if (!(await stat(resolved)).isFile()) throw new Error('Reference must identify a regular file: ' + relative);
  return resolved;
}
async function readEvidence(root, ref) {
  const resolved = await resolveFile(root, ref.path), bytes = await readFile(resolved);
  return { resolved, bytes, contentHash: hash(bytes) };
}
function outcome(entries, problems) {
  if (problems.some((item) => item.severity === 'blocking')) return 'incomplete';
  for (const status of ['failed', 'stale', 'incomplete', 'planned']) if (entries.some((entry) => entry.status === status)) return status;
  return entries.length ? 'verified' : 'incomplete';
}
const watchedConfig = /^(package(?:-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig(?:\.[^.]+)*\.json|jsconfig\.json|[^/]+\.config\.(?:js|cjs|mjs|ts|json)|Cargo\.(?:toml|lock)|go\.(?:mod|sum)|pyproject\.toml|requirements(?:-[^.]+)?\.txt|pom\.xml|build\.gradle(?:\.kts)?)$/;
async function configState(root) {
  const result = {};
  let visited = 0;
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (++visited > 30000) throw new Error('Repository configuration scan exceeds 30000 entries.');
      if (item.isSymbolicLink()) continue;
      const candidate = path.join(directory, item.name);
      if (item.isDirectory() && !['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.venv', 'target'].includes(item.name)) await visit(candidate);
      else if (item.isFile() && watchedConfig.test(item.name)) result[path.relative(root, candidate)] = hash(await readFile(candidate));
    }
  }
  await visit(root);
  return result;
}
function outputSummary(value) {
  const bytes = Buffer.from(value || '', 'utf8');
  if (bytes.length <= 65536) return value || '';
  let summary = bytes.subarray(0, 65536).toString('utf8');
  while (Buffer.byteLength(summary, 'utf8') > 65536) summary = summary.slice(0, -1);
  return summary;
}
function runCheck(root, check) {
  // Explicit report commands require opt-in; model prose is never evaluated and no shell is used.
  const env = { ...process.env };
  // Node's internal test-runner context otherwise makes nested node --test silently skip all tests.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(check.command, check.args, {
    env, cwd: root, shell: false, timeout: check.timeoutMs ?? 30000, maxBuffer: check.maxOutputBytes ?? 65536, encoding: 'utf8', windowsHide: true,
  });
  const emptyTap = check.kind === 'behavior' && /^TAP version [0-9]+/m.test(result.stdout || '') &&
    (/(?:^|\n)# (?:tests|pass) 0(?:\r?\n|$)/.test(result.stdout || '') ||
      /^[ \t]*1\.\.0(?:[ \t]*#.*)?\r?$/m.test(result.stdout || ''));
  return { id: check.id, kind: check.kind, status: result.status === 0 && !result.error && !result.signal && !emptyTap ? 'passed' : 'failed',
    exitCode: result.status, signal: result.signal, timeoutMs: check.timeoutMs ?? 30000, maxOutputBytes: check.maxOutputBytes ?? 65536,
    stdout: outputSummary(result.stdout), stderr: outputSummary(result.stderr), error: result.error?.message ?? (emptyTap ? 'TAP reports no passing tests; acceptance checks did not execute.' : null) };
}

export async function verifyImplementation({ root, snapshot, report, runChecks = false }) {
  const problems = [];
  try { snapshot = expandInput(snapshot, 'snapshot'); }
  catch { problems.push(issue('invalid_snapshot', 'Expected a valid version 2 snapshot with shared references.')); }
  try { report = expandInput(report, 'report'); }
  catch { problems.push(issue('invalid_report', 'Expected a valid version 2 report with source version references.')); }
  if (!problems.length) problems.push(...validateInputs(snapshot, report));
  const result = { version: 1, overall: 'incomplete', verificationAuthority: 'not-executed',
    verificationScope: 'declared-commands-and-reference-consistency', acceptanceCoverage: 'agent-declared-not-independently-confirmed',
    issues: problems, entries: [],
    limitations: ['This is local execution evidence, not platform verification or proof of correctness; refresh the snapshot through MCP first.',
      'Symbols are checked as text references, not parsed or semantically proved.',
      'Passing declared commands cannot establish the completeness or independence of supplied tests.',
      'Criterion coverage is agent-declared; testName execution and semantic coverage are not verified without runner-specific integration.',
      'Record build configuration, lockfiles and indirect source dependencies in inputRefs; dependencies cannot be inferred universally.',
      'Only referenced files and common configuration files are checked for changes during execution.'] };
  if (problems.length) return result;
  if (report.contextVersion !== snapshot.contextVersion)
    problems.push(issue('context_refreshed', 'Context version changed; each task is evaluated against its own complete source versions.', 'warning'));
  let repository;
  try {
    repository = await realpath(root);
    if (!(await stat(repository)).isDirectory()) throw new Error('Root is not a directory.');
  } catch (error) { problems.push(issue('invalid_root', error.message)); return result; }
  const manifest = new Map(snapshot.manifest.map((version) => [version.artifactId, version]));
  const entries = new Map(report.entries.map((entry) => [entry.taskId, entry]));
  const evidence = new Map();
  for (const task of snapshot.tasks) {
    const entry = entries.get(task.id);
    const assessment = { taskId: task.id, status: entry?.status === 'planned' ? 'planned' : 'incomplete', issues: [], checks: [] };
    result.entries.push(assessment);
    const add = (code, message, severity) => assessment.issues.push(issue(code, message, severity));
    if (!entry) { add('missing_task', 'Task has no implementation entry.'); continue; }
    if (!sameSet(entry.requirementIds, task.requirementIds)) add('requirement_coverage', 'Requirement IDs must exactly match the task.');
    const candidates = new Set(task.designRefs.map(designKey));
    if (entry.designRefs.some((ref) => !candidates.has(designKey(ref))) || (candidates.size && !entry.designRefs.length))
      add('design_coverage', 'Select existing design-element references from this task; unrelated references are not allowed.');
    if (!task.designRefs.length) add('no_design_refs', 'This task has no design-element references; implementation design requires review.', 'warning');
    if (!sameSet(entry.sourceVersions.map((version) => version.artifactId), task.sourceArtifactIds))
      add('stale_sources', 'Report must include every task source version and no unrelated versions.');
    for (const version of entry.sourceVersions) {
      if (stable(version) !== stable(manifest.get(version.artifactId))) add('stale_sources', 'Source version differs: ' + version.artifactId);
      if (version.freshness === 'stale') add('stale_sources', 'Source is outdated: ' + version.artifactId);
      if (version.freshness === 'unknown') add('unknown_freshness', 'Source freshness is unknown and requires review: ' + version.artifactId, 'warning');
    }
    assessment.issues.push(...task.issues);
    for (const target of entry.plannedTargets)
      if (!relativePath(target.path)) add('invalid_path', 'Planned target is not a safe relative path: ' + target.path);
    if (entry.status === 'planned') {
      if (entry.actualRefs.length || (entry.inputRefs || []).length || entry.testRefs.length || entry.checks.length)
        add('planned_evidence', 'A planned entry cannot contain implementation evidence.');
    } else {
      if (!entry.actualRefs.length) add('missing_code', 'Implemented task must reference actual code.');
      if (!entry.testRefs.length) add('missing_tests', 'Implemented task must reference test files.');
      const criterionIds = task.acceptanceCriteria.map((criterion) => criterion.id);
      if (!criterionIds.length) add('missing_criteria', 'Task has no explicit acceptance criteria.');
      const testCriteria = new Set(entry.testRefs.flatMap((ref) => ref.criterionIds));
      const behaviorCriteria = new Set(entry.checks.filter((check) => check.kind === 'behavior').flatMap((check) => check.criterionIds));
      if (!sameSet([...testCriteria], criterionIds)) add('test_coverage', 'Test references must cover all task criteria and no unknown criteria.');
      if (!sameSet([...behaviorCriteria], criterionIds)) add('behavior_coverage', 'Behavior checks must cover all task criteria and no unknown criteria.');
      if (entry.checks.some((check) => check.criterionIds.some((id) => !criterionIds.includes(id)))) add('unknown_criterion', 'A check references an unknown criterion.');
      if (!entry.checks.some((check) => check.kind === 'engineering')) add('missing_engineering', 'An engineering check is required.');
      if (!entry.checks.some((check) => check.kind === 'behavior')) add('missing_behavior', 'A behavior check is required.');
      for (const ref of [...entry.actualRefs, ...(entry.inputRefs || []), ...entry.testRefs]) {
        try {
          const observed = await readEvidence(repository, ref);
          if (observed.contentHash !== ref.contentHash.toLowerCase()) add('stale_file', 'File changed since evidence was recorded: ' + ref.path);
          if (ref.symbol && !observed.bytes.toString('utf8').includes(ref.symbol)) add('missing_symbol', 'Symbol text was not found: ' + ref.path + ' / ' + ref.symbol);
          const previous = evidence.get(ref.path);
          if (previous && (previous.contentHash !== observed.contentHash || previous.resolved !== observed.resolved))
            add('stale_file', 'File changed during evidence collection: ' + ref.path);
          evidence.set(ref.path, observed);
        } catch (error) { add('invalid_file', error.message); }
      }
    }
    if (assessment.issues.some((item) => item.code.startsWith('stale_'))) assessment.status = 'stale';
    else if (assessment.issues.some((item) => item.severity === 'blocking')) assessment.status = 'incomplete';
  }
  // Only fresh, complete tasks may execute. Unrelated source changes do not erase valid per-task evidence.
  const ready = (entry) => entry.status !== 'planned' && !entry.issues.some((item) => item.severity === 'blocking');
  if (runChecks === true && result.entries.some(ready)) {
    let before;
    try { before = await configState(repository); }
    catch (error) { problems.push(issue('configuration_scan', error.message)); }
    if (before) {
      result.verificationAuthority = 'local-execution';
      const ordered = [], orderedIds = new Set();
      const assessments = new Map(result.entries.map((entry) => [entry.taskId, entry]));
      const tasks = new Map(snapshot.tasks.map((task) => [task.id, task]));
      function order(id) {
        if (orderedIds.has(id)) return;
        orderedIds.add(id);
        tasks.get(id).dependsOnTaskIds.forEach(order);
        ordered.push(assessments.get(id));
      }
      snapshot.tasks.forEach((task) => order(task.id));
      for (const assessment of ordered) {
        if (!ready(assessment)) continue;
        assessment.checks = entries.get(assessment.taskId).checks.map((check) => runCheck(repository, check));
        assessment.status = assessment.checks.every((check) => check.status === 'passed') ? 'verified' : 'failed';
        if (assessment.status === 'failed') assessment.issues.push(issue('check_failed', 'A command failed, timed out, exceeded output limits, or could not start.'));
      }
      // Cyclic designs can be verified together; propagate only actual missing or failed prerequisites.
      let propagated;
      do {
        propagated = false;
        for (const assessment of result.entries) {
          if (assessment.status === 'verified' && tasks.get(assessment.taskId).dependsOnTaskIds.some((id) => assessments.get(id).status !== 'verified')) {
            assessment.status = 'incomplete';
            assessment.issues.push(issue('dependency_unverified', 'A prerequisite task did not verify during this execution.'));
            propagated = true;
          }
        }
      } while (propagated);
      let changed = false;
      for (const [relative, previous] of evidence) {
        try {
          const current = await readEvidence(repository, { path: relative });
          if (current.contentHash !== previous.contentHash || current.resolved !== previous.resolved) changed = true;
        } catch { changed = true; }
      }
      try { if (stable(before) !== stable(await configState(repository))) changed = true; }
      catch { changed = true; }
      if (changed) for (const assessment of result.entries) {
        assessment.status = 'stale';
        assessment.issues.push(issue('stale_during_checks', 'Evidence or repository configuration changed while checks ran; record new evidence and rerun.'));
      }
    }
  } else if (!runChecks) {
    for (const assessment of result.entries)
      if (assessment.status === 'incomplete' && !assessment.issues.some((item) => item.severity === 'blocking'))
        assessment.issues.push(issue('checks_not_executed', 'Use --run-checks to explicitly execute local report commands.'));
  }
  result.overall = outcome(result.entries, problems);
  return result;
}

async function main(args) {
  const options = { root: '.', snapshot: '.uml-implementation-context.json', report: '.uml-implementation.json', runChecks: false };
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (option === '--run-checks') options.runChecks = true;
    else if (['--root', '--snapshot', '--report'].includes(option) && args[index + 1] && !args[index + 1].startsWith('--'))
      options[option.slice(2)] = args[++index];
    else throw new Error('Usage: node uml-verify.mjs --root . --snapshot .uml-implementation-context.json --report .uml-implementation.json [--run-checks]');
  }
  const repository = await realpath(options.root);
  const snapshotInput = await readEvidence(repository, { path: options.snapshot });
  const reportInput = await readEvidence(repository, { path: options.report });
  const snapshot = JSON.parse(snapshotInput.bytes.toString('utf8'));
  const report = JSON.parse(reportInput.bytes.toString('utf8'));
  const assessment = await verifyImplementation({ root: repository, snapshot, report, runChecks: options.runChecks });
  if (options.runChecks) {
    let changed = false;
    for (const [relative, previous] of [[options.snapshot, snapshotInput], [options.report, reportInput]]) {
      try {
        const current = await readEvidence(repository, { path: relative });
        if (current.contentHash !== previous.contentHash || current.resolved !== previous.resolved) changed = true;
      } catch { changed = true; }
    }
    if (changed) {
      assessment.overall = 'stale';
      assessment.issues.push(issue('stale_inputs', 'Snapshot or report changed during execution.'));
      for (const entry of assessment.entries) if (entry.status === 'verified') entry.status = 'stale';
    }
  }
  process.stdout.write(JSON.stringify(assessment, null, 2) + '\n');
  process.exitCode = assessment.overall === 'verified' ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stdout.write(JSON.stringify({ version: 1, overall: 'incomplete', verificationAuthority: 'not-executed', entries: [], issues: [issue('invalid_input', error.message)] }, null, 2) + '\n');
    process.exitCode = 1;
  });
}
`;
