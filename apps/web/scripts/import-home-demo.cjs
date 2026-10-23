// Imports upstream UI with text localization and data adapters, verifying original JSX layout and styles.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const localize = require('./localize-home-demo.cjs');
function bodyHash(code) {
  const normalized = code.replace(/((?:from\s*|import\s*\(\s*|import\s*)['"])([^'"]+)(['"])/g, '$1__source_module__$3');
  const printed = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(ts.createSourceFile('source.tsx', normalized, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  return crypto.createHash('sha256').update(printed).digest('hex');
}
function structureHash(code) {
  const file = ts.createSourceFile('source.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes = [];
  const visit = node => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) nodes.push([node.kind, node.tagName.getText(file), node.attributes.properties.map(attribute => ts.isJsxAttribute(attribute) ? [attribute.name.getText(file), ['className', 'style'].includes(attribute.name.getText(file)) ? attribute.initializer?.getText(file) : null] : attribute.getText(file))]);
    if (ts.isJsxClosingElement(node)) nodes.push([node.kind, node.tagName.getText(file)]);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return crypto.createHash('sha256').update(JSON.stringify(nodes)).digest('hex');
}
if (!process.argv[2]) throw new Error('Usage: node apps/web/scripts/import-home-demo.cjs <assistant-ui-source-directory>');
const origin = path.resolve(process.argv[2]).replaceAll('\\', '/');
const target = path.resolve(__dirname, '../src/features/standard-project/components/home-demo').replaceAll('\\', '/');
const docs = origin + '/apps/docs';
const ui = origin + '/packages/ui/src';
const integrations = Object.fromEntries(['model', 'session', 'persisted-preference', 'demo-usage-client', 'analytics'].map(name => ['@/lib/' + name, target + '/integration/' + name + (name === 'session' ? '.tsx' : '.ts')]));
integrations['@assistant-ui/ai-sdk'] = target + '/integration/token-usage.ts';
for (const name of ['popover', 'tooltip', 'dialog']) integrations['@base-ui/react/' + name] = target + '/integration/base-' + name + '.tsx';
const seen = new Map(); const manifest = [];
function locate(base) { return ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map(ext => base + ext).find(file => fs.existsSync(file) && fs.statSync(file).isFile()); }
function resolveAlias(spec) {
  const suffix = spec.slice(2);
  return locate(docs + '/' + suffix)
    || (suffix.startsWith('components/assistant-ui/') && locate(ui + '/components/react/' + suffix.slice(11)))
    || (suffix.startsWith('components/ui/') && locate(ui + '/components/react/ui/base/' + suffix.slice(14))) || locate(ui + '/' + suffix);
}
function relative(from, to) { let value = path.relative(path.dirname(from), to).replaceAll('\\', '/').replace(/\.(tsx?|jsx?)$/, ''); return value.startsWith('.') ? value : './' + value; }
function destination(file) {
  let rel = file.slice(origin.length + 1);
  rel = rel.replace('apps/docs/components/pages/home/demo/', '').replace('apps/docs/components/assistant-ui/', '').replace('apps/docs/components/shared/', '').replace('apps/docs/lib/', 'utils/').replace('packages/ui/src/components/react/assistant-ui/', '').replace('packages/ui/src/components/react/ui/base/', 'ui/').replace('packages/ui/src/', '');
  return target + '/source/' + rel;
}
function copy(file) {
  file = file.replaceAll('\\', '/');
  if (seen.has(file)) return seen.get(file);
  const out = destination(file); seen.set(file, out);
  const original = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  let text = original.replace(/((?:from\s*|import\s*\(\s*|import\s*)['"])([^'"]+)(['"])/g, (whole, before, spec, after) => {
    let dest;
    if (file.endsWith('/pages/home/demo/composer.tsx') && spec === 'react') dest = target + '/integration/composer-hooks.ts';
    else if (file.endsWith('/pages/home/demo/messages.tsx') && spec === '@assistant-ui/react') dest = target + '/integration/message-grouping.ts';
    // Keep the original selector available; the user requested a shared Switch beside its trigger.
    else if (file.endsWith('/pages/home/demo/composer.tsx') && spec === '@/components/assistant-ui/elements/model-selector.aui') {
      copy(resolveAlias(spec)); dest = target + '/integration/reasoning-switch.tsx';
    }
    else if (spec === '@assistant-ui/react' && /ActionBarMorePrimitive|SelectionToolbarPrimitive/.test(original)) dest = target + '/integration/assistant-primitives.tsx';
    else if (integrations[spec]) dest = integrations[spec];
    else if (spec.startsWith('@/')) { const resolved = resolveAlias(spec); if (!resolved) throw new Error('Missing source: ' + spec); dest = copy(resolved); }
    else if (spec.startsWith('.')) { const resolved = locate(path.resolve(path.dirname(file), spec)); if (resolved) dest = copy(resolved); }
    return dest ? before + relative(out, dest) + after : whole;
  });
  text = localize(out, text, target);
  // Some upstream helpers contain no translated text; keep unused imports out of strict builds.
  if ((text.match(/\bhomeText\b/g) || []).length === 1) text = text.replace(/^import \{ homeText \} from [^\n]+\n/m, "");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (structureHash(original) !== structureHash(text)) throw new Error('Source layout/style changed: ' + file);
  fs.writeFileSync(out, '// assistant-ui homepage source; module paths and UI language adapted, layout/styles preserved. See home-demo/LICENSE.\n' + text);
  manifest.push({ file: path.relative(target, out).replaceAll('\\', '/'), source: file.slice(origin.length + 1), sha256: crypto.createHash('sha256').update(original).digest('hex'), bodySha256: bodyHash(original), adaptedBodySha256: bodyHash(text), structureSha256: structureHash(original) });
  return out;
}
copy(docs + '/components/pages/home/demo/thread.tsx');
copy(docs + '/lib/persisted-preference.ts');
fs.copyFileSync(origin + '/LICENSE', target + '/LICENSE');
for (const [source, file] of [['apps/docs/styles/globals.css', 'source/styles/globals.css'], ['packages/tw-shimmer/src/index.css', 'source/styles/shimmer.css']]) {
  const content = fs.readFileSync(origin + '/' + source, 'utf8').replace(/\r\n/g, '\n');
  fs.mkdirSync(path.dirname(target + '/' + file), { recursive: true });
  fs.writeFileSync(target + '/' + file, content);
  manifest.push({ file, source, sha256: crypto.createHash('sha256').update(content).digest('hex') });
}
fs.writeFileSync(target + '/source-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Imported ${seen.size} components/helpers and 2 style sources; original JSX layout and styles verified.`);
for (const name of ['popover', 'tooltip', 'dialog']) {
  const component = name[0].toUpperCase() + name.slice(1);
  const file = fs.readFileSync(target + '/source/ui/' + name + '.tsx', 'utf8');
  const parts = [...new Set([...file.matchAll(/\w+Primitive\.(\w+)\.Props/g)].map(m => m[1]))];
  const content = `// Routes upstream overlays into their isolated theme host; component markup remains unchanged.
import { ${component} as Original } from "@base-ui/react/${name}";
import { forwardRef, type ComponentProps } from "react";
import { useHomePortal } from "./portals";
const Portal = forwardRef<HTMLDivElement, ComponentProps<typeof Original.Portal>>(function HomePortal(props, ref) {
  const container = useHomePortal();
  return <Original.Portal {...props} ref={ref} container={props.container ?? container} />;
});
export const ${component} = { ...Original, Portal };
export namespace ${component} {
${parts.map(part => `  export namespace ${part} { export type Props = Original.${part}.Props; }`).join('\n')}
}
`;
  fs.writeFileSync(target + '/integration/base-' + name + '.tsx', content);
}

const iconsTarget = path.resolve(__dirname, '../public/assistant-ui/icons');
fs.mkdirSync(iconsTarget, { recursive: true });
for (const entry of fs.readdirSync(docs + '/public/icons', { withFileTypes: true })) if (entry.isFile() && entry.name.endsWith('.svg')) fs.copyFileSync(docs + '/public/icons/' + entry.name, iconsTarget + '/' + entry.name);
