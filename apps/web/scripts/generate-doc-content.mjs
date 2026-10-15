// Generates client-importable article text because Next.js cannot evaluate Vite's import.meta.glob.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(webRoot, 'src/features/product-docs/content');
const outputPath = path.join(webRoot, 'src/features/product-docs/model/docs-content.generated.ts');
const entries = await Promise.all(
  (await readdir(contentDir)).filter((name) => name.endsWith('.md')).sort().map(async (name) => [
    `../content/${name}`,
    await readFile(path.join(contentDir, name), 'utf8'),
  ]),
);
const output = `// Generated article text for the client bundle. Edit the Markdown source files instead.\nexport const markdownModules: Record<string, string> = ${JSON.stringify(Object.fromEntries(entries), null, 2)};\n`;
await writeFile(outputPath, output, 'utf8');
