// Guards template provenance, SPA compatibility and shared business primitives.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import sources from './template-sources.json';
describe('template UI governance', () => {
    it('keeps every imported template source accounted for', () => {
        expect(sources.length).toBeGreaterThan(0);
        for (const entry of sources) {
            expect(existsSync(entry.target), entry.target).toBe(true);
            expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
            const source = readFileSync(entry.target, 'utf8');
            expect(source, entry.target).not.toMatch(/from ['"]next\//);
        }
    });
    it('uses Base UI in business primitives', () => {
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
            'src/features/user-platform/components/account-dialog.tsx': ['input'],
            // The standalone source-derived SVG canvas keeps its native zoom/expand controls.
            'src/features/standard-project/components/elements/diagram.tsx': ['button']
        };
        const collect = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
            const path = `${dir}/${entry.name}`;
            if (entry.isDirectory()) {
                if (path === 'src/features/marketing-site')
                    return [];
                // The user-selected assistant-ui source has its own exact-source integrity checks.
                if (path === 'src/features/standard-project/components/home-demo/source')
                    return [];
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
                    if (forbidden.has(tag) && !(whitelist[file] ?? []).includes(tag))
                        violations.push(tag);
                }
                ts.forEachChild(node, visit);
            };
            visit(sourceFile);
            expect(violations, file).toEqual([]);
        }
    });
    it('keeps website marketing assets outside the community workspace', () => {
        expect(existsSync('src/features/marketing-site')).toBe(false);
        expect(existsSync('public/marketing')).toBe(false);
    });
});
