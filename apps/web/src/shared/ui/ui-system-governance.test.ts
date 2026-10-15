// Guards template provenance, SPA compatibility and the separation between AdminCN and Flow.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import sources from './template-sources.json';
describe('template UI governance', () => {
  it('preserves the imported Flow animation parameters', () => {
    for (const entry of sources.filter(entry => 'motionSha256' in entry)) {
      const file = ts.createSourceFile(entry.target, readFileSync(entry.target, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const attributes: unknown[] = [];
      const visit = (node: ts.Node) => {
        if (ts.isJsxAttribute(node) && ['animate', 'initial', 'whileInView', 'whileHover', 'transition', 'viewport', 'duration', 'delay', 'motionProps', 'slide', 'inView'].includes(node.name.getText(file))) {
          attributes.push([node.name.getText(file), node.initializer?.getText(file).replace(/\s+/g, ' ')]);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      expect(createHash('sha256').update(JSON.stringify(attributes)).digest('hex'), entry.target).toBe(entry.motionSha256);
    }
  });
  it('keeps every imported template source accounted for', () => {
    expect(sources.length).toBeGreaterThan(50);
    for (const entry of sources) {
      expect(existsSync(entry.target), entry.target).toBe(true);
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
      const source = readFileSync(entry.target, 'utf8');
      expect(source, entry.target).not.toMatch(/from ['"]next\//);
    }
  });
  it('uses Base UI in business primitives and keeps Flow components isolated', () => {
    for (const name of ['button', 'dialog', 'dropdown-menu', 'select', 'checkbox', 'tabs']) {
      const source = readFileSync(`src/shared/ui/${name}.tsx`, 'utf8');
      expect(source).toContain('@base-ui/react');
      expect(source).not.toContain('@radix-ui/');
    }
    for (const file of readdirSync('src/shared/ui').filter(file => file.endsWith('.tsx'))) {
      expect(readFileSync(`src/shared/ui/${file}`, 'utf8')).not.toContain('features/marketing-site/template');
    }
  });
  it('keeps business pages on template primitives without raw form or table elements', () => {
    const forbidden = new Set(['button', 'input', 'textarea', 'select', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']);
    // Documented exceptions: hidden file pickers and third-party editor hosts.
    const whitelist: Record<string, string[]> = {
      'src/features/user-platform/components/account-dialog.tsx': ['input']
    };
    const collect = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (path === 'src/features/marketing-site') return [];
          return collect(path);
        }
        return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : [];
      });
    for (const file of [...collect('src/features'), ...collect('src/app')]) {
      const sourceFile = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const violations: string[] = [];
      const visit = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
          const tag = node.tagName.getText(sourceFile);
          if (forbidden.has(tag) && !(whitelist[file] ?? []).includes(tag)) violations.push(tag);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
      expect(violations, file).toEqual([]);
    }
  });
  it('retains original Flow motion timings and homepage block order', () => {
    const base = 'src/features/marketing-site/template/components/';
    expect(readFileSync(base + 'blocks/hero-section/text-flip.tsx', 'utf8')).toContain('duration = 3000');
    expect(readFileSync(base + 'blocks/testimonials/testimonials.tsx', 'utf8')).toContain('duration={70}');
    expect(readFileSync(base + 'ui/motion-preset.tsx', 'utf8')).toContain('stiffness: 200, damping: 20');
    const home = readFileSync('src/features/marketing-site/components/marketing-home-page.tsx', 'utf8');
    const order = ['<Hero', '<TrustedBrands', '<Features', '<Benefits', '<Testimonials', '<FAQ', '<CTA'].map(tag => home.indexOf(tag));
    expect(order.every(index => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a,b) => a-b));
  });
});
