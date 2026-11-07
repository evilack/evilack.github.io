import { readFile, writeFile } from 'node:fs/promises';
import { renderSiteHeader } from './site-header.mjs';

const check = process.argv.includes('--check');
for (const [file, language, page] of [
  ['index.html', 'en', 'home'], ['index-ko.html', 'ko', 'home'],
  ['donate.html', 'en', 'support'], ['donate-ko.html', 'ko', 'support'],
  ['donate-en.html', 'en', 'support'],
]) {
  const url = new URL('../' + file, import.meta.url);
  const original = await readFile(url, 'utf8');
  const header = /<header class="site-header">[\s\S]*?<\/header>/;
  if (!header.test(original)) throw new Error(`Missing site header: ${file}`);
  const updated = original.replace(header, () => renderSiteHeader(language, page));
  if (check && updated !== original) throw new Error(`Out-of-date site header: ${file}. Run node tools/sync-site-header.mjs.`);
  if (!check) await writeFile(url, updated);
}
console.log(check ? 'All 5 headers match the shared source.' : 'Updated all 5 headers from the shared source.');
