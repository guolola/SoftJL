// Runs the same validation gate for branch CI and the main production deployment workflow.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const verificationScripts = [
  'audit:docs', 'test:contracts', 'test:prompts', 'test:api', 'test:render',
  'test:web', 'test:harness-eval', 'test:deploy', 'test:scripts', 'test:ci',
  'lint:web', 'typecheck:web', 'typecheck:harness-eval',
];

export function scriptsForGroup(group = 'all') {
  if (!['all', 'server', 'web'].includes(group)) throw new Error(`Unknown validation group: ${group}`);
  return verificationScripts.filter((script) => group === 'all' || (script === 'test:web') === (group === 'web'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const group = process.argv[2] ?? 'all';
  if (process.argv.length > 3) throw new Error('Expected an optional all, server, or web group');
  const scripts = scriptsForGroup(group);
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run this gate with npm run verify');
  for (const script of scripts) {
    execFileSync(process.execPath, [npmCli, 'run', script], { stdio: 'inherit' });
  }
}
