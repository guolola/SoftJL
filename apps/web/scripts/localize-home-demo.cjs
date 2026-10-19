// Adds locale subscriptions and text-only translations while preserving source JSX, styles and workflows.
const path = require('node:path');
const ts = require('typescript');
const dictionary = require('../src/features/standard-project/components/home-demo/integration/home-demo-zh.json');
module.exports = function localize(file, text, target) {
  if (!file.endsWith('.tsx')) return text;
  const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const add = (start, end, value) => edits.push({ start, end, value });
  const has = value => Object.hasOwn(dictionary, value);
  const parentIsTextContext = node => ts.isConditionalExpression(node.parent) || ts.isReturnStatement(node.parent) || ts.isJsxExpression(node.parent) || ts.isParameter(node.parent) || ts.isBindingElement(node.parent)
    || (ts.isBinaryExpression(node.parent) && ['??', '||'].includes(node.parent.operatorToken.getText(parsed)))
    || (ts.isCallExpression(node.parent) && node.parent.expression.getText(parsed) === 'toast.error');
  function visit(node) {
    if (ts.isJsxText(node) && has(node.text.trim())) {
      add(node.pos, node.end, `{homeText(${JSON.stringify(node.text.trim())})}`);
      return;
    }
    if (ts.isStringLiteral(node) && has(node.text)) {
      if (ts.isJsxAttribute(node.parent) && !['className', 'style', 'type', 'id', 'value', 'key', 'role'].includes(node.parent.name.getText(parsed))) add(node.getStart(parsed), node.end, `{homeText(${node.getText(parsed)})}`);
      else if (parentIsTextContext(node)) add(node.getStart(parsed), node.end, `homeText(${node.getText(parsed)})`);
    }
    if (ts.isTemplateExpression(node) && (['Welcome back, ', 'Preview of ', 'Preview ', 'Remove ', 'Show all '].includes(node.head.text)
      || (node.head.text === '' && (/% full| tools$/.test(node.templateSpans.at(-1).literal.text) || node.templateSpans.some(span => span.literal.text === ' attachment '))))) {
      add(node.getStart(parsed), node.end, `homeText(${node.getText(parsed)})`);
      return;
    }
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name && /^[A-Z]/.test(node.name.text) && node.body) add(node.body.getStart(parsed) + 1, node.body.getStart(parsed) + 1, '\n  useHomeLocale();');
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^[A-Z]/.test(node.name.text) && node.initializer && ts.isArrowFunction(node.initializer)) {
      const body = node.initializer.body;
      if (ts.isBlock(body)) add(body.getStart(parsed) + 1, body.getStart(parsed) + 1, '\n  useHomeLocale();');
      else { add(body.getStart(parsed), body.getStart(parsed), '{ useHomeLocale(true); return '); add(body.end, body.end, '; }'); }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  // Dynamic source UI labels are translated at their display site, never at the data/model boundary.
  const dynamic = {
    'suggestions.tsx': ['suggestion.label'],
    'trace.tsx': ['label'],
    'trace-line.tsx': ['label', 'detail'],
    'context-display.tsx': ['segment.label'],
    'feedback-popover.tsx': ['cat.label'],
    'model-selector.tsx': ['option.name', 'selectedEffort.name', 'effortName', 'label'],
    'composer-trigger-popover.aui.tsx': ['backLabel', 'emptyLabel', 'loadingLabel', 'item.description'],
    'file.tsx': [],
  };
  let result = text;
  for (const edit of edits.sort((a,b) => b.start - a.start || b.end - a.end)) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  const name = path.basename(file);
  for (const expression of dynamic[name] ?? []) result = result.replaceAll(`{${expression}}`, `{homeText(${expression})}`);
  if (name === 'trace-line.tsx' || name === 'trace.tsx') result = result.replaceAll('` ${detail}`', '` ${homeText(detail)}`');
  if (name === 'suggestions.tsx') result = result.replace('prompt={suggestion.prompt}', 'prompt={homeText(suggestion.prompt)}');
  if (name === 'context-display.tsx') result = result.replace('{Math.round(percent)}% full', '{homeText(`${Math.round(percent)}% full`)}');
  if (result !== text) {
    let relative = path.relative(path.dirname(file), target + '/integration/home-locale').replaceAll('\\', '/');
    if (!relative.startsWith('.')) relative = './' + relative;
    const imported = `import { homeText, useHomeLocale } from "${relative}";\n`;
    result = result.startsWith('"use client";') ? result.replace('"use client";', '"use client";\n' + imported) : imported + result;
  }
  return result;
};
