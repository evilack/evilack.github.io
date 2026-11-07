import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject, validateSite } from './lib/configuration.mjs';
import { renderTemplate, inlineMarkup } from './lib/rendering.mjs';
import { outputPath, createSiteFiles, buildSite } from './lib/site-builder.mjs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PreferenceStore } from '../src/runtime/preferences.js';
const project = await loadProject();
test('blocked storage property and read/write failures stay within the preference boundary', () => {
  const unavailable = new PreferenceStore(() => { throw new Error('Denied'); });
  assert.equal(unavailable.read('test'), null);assert.equal(unavailable.write('test', 'value'), false);
  const broken = new PreferenceStore(() => ({ getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); } }));
  assert.equal(broken.read('test'), null);assert.equal(broken.write('test', 'value'), false);
});
test('preference storage uses the requested data key without unrelated writes', () => {
  const values = new Map();const store = new PreferenceStore(() => ({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }));
  store.write('custom-key', 'choice');assert.equal(store.read('custom-key'), 'choice');assert.equal(values.size, 1);
});
test('invalid payment origins and unknown default projects fail before files are built', () => {
  const wrongOrigin = structuredClone(project.site);wrongOrigin.support.projects[0].payment.url = 'https://invalid.example/checkout';
  assert.throws(() => validateSite(wrongOrigin, project.locales), /결제 링크/);
  const invalidDefault = structuredClone(project.site);invalidDefault.support.defaultProject = 'missing';
  assert.throws(() => validateSite(invalidDefault, project.locales), /기본 후원 프로젝트/);
});
test('duplicate page routes and missing language copy fail clearly', () => {
  const duplicate = structuredClone(project.site);duplicate.pages.support.routes.en = duplicate.pages.home.routes.en;
  assert.throws(() => validateSite(duplicate, project.locales), /중복/);
  const missing = structuredClone(project.locales);delete missing.ko.support;
  assert.throws(() => validateSite(project.site, missing), /번역/);
  const missingEntry = structuredClone(project.site);missingEntry.pages.home.routes.en = 'english-home.html';
  assert.throws(() => validateSite(missingEntry, project.locales), /index.html/);
});
test('template values are escaped and unexpected inline markup cannot execute', () => {
  assert.equal(renderTemplate('<p>{{copy}}</p>', { copy: '<script>"&' }), '<p>&lt;script&gt;&quot;&amp;</p>');
  assert.equal(inlineMarkup('A<br><script>alert(1)</script>'), 'A<br>&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.throws(() => renderTemplate('{{missing}}', {}), /누락/);
});
test('generated output cannot traverse out of its intended directory', () => {
  assert.throws(() => outputPath(project.root, '../outside.html'), /출력 폴더 밖/);
});
test('changing a route in data changes canonical URLs, navigation and browser settings without code edits', async () => {
  const altered = { ...project, site: structuredClone(project.site) };
  altered.site.pages.support.routes.en = 'support-english.html';
  const files = await createSiteFiles(altered);
  const home = files.get('index.html').toString();
  assert.ok(home.includes('href="./support-english.html"'));
  assert.ok(files.get('support-english.html').toString().includes('https://evilack.github.io/support-english.html'));
});
test('build results are deterministic and do not fetch runtime configuration', async () => {
  const first = await createSiteFiles(project), second = await createSiteFiles(project);
  assert.deepEqual([...first.keys()], [...second.keys()]);
  for (const [name, bytes] of first) assert.ok(bytes.equals(second.get(name)), name);
  const home = first.get('index.html').toString();
  assert.equal((home.match(/<script src=/g) || []).length, 1);
  assert.ok(home.indexOf('type="application/json"') < home.indexOf('<script src='));
  assert.ok(!home.includes(project.site.support.projects[0].payment.url), '홈페이지에는 사용하지 않는 결제 카탈로그를 싣지 않습니다.');
});

test('section anchors and payment descriptions follow their configured IDs', async () => {
  const altered = { ...project, site: structuredClone(project.site) };
  Object.assign(altered.site.anchors, { work: 'projects', about: 'bio', support: 'give' });
  altered.site.dom.amountNoteId = 'payment-amount-note';
  const files = await createSiteFiles(altered);
  const home = files.get('index.html').toString(), support = files.get('donate.html').toString();
  for (const id of ['projects', 'bio', 'give']) assert.ok(home.includes('id="' + id + '"'), id);
  assert.equal((home.match(/href="\.\/index.html#projects"/g) || []).length, 2);
  assert.ok(support.includes('id="payment-amount-note"'));
  assert.ok(support.includes('aria-describedby="payment-amount-note '));
});

test('build/check preserve unrelated files and remove only obsolete generated files', async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'ev-cabinet-build-test-'));
  const isolated = { ...project, tooling: structuredClone(project.tooling) };
  isolated.tooling.paths.output = temporaryRoot;
  try {
    const manifest = await buildSite(isolated);
    await writeFile(path.join(temporaryRoot, 'unrelated.txt'), 'keep');
    await writeFile(path.join(temporaryRoot, 'old-generated.js'), 'obsolete');
    await writeFile(path.join(temporaryRoot, isolated.tooling.build.manifestFile), JSON.stringify({ ...manifest, files: [...manifest.files, 'old-generated.js'] }));
    await buildSite(isolated);
    assert.equal(await readFile(path.join(temporaryRoot, 'unrelated.txt'), 'utf8'), 'keep');
    await assert.rejects(readFile(path.join(temporaryRoot, 'old-generated.js')), { code: 'ENOENT' });
    await writeFile(path.join(temporaryRoot, 'index.html'), 'manual change');
    await assert.rejects(buildSite(isolated, { check: true }), /최신 상태/);
    assert.equal(await readFile(path.join(temporaryRoot, 'index.html'), 'utf8'), 'manual change');
  } finally {
    // 재귀 삭제는 이 테스트가 직접 만든 임시 폴더 안으로 한정합니다.
    const relative = path.relative(tmpdir(), temporaryRoot);
    assert.ok(relative.startsWith('ev-cabinet-build-test-') && !relative.includes(path.sep));
    await rm(temporaryRoot, { recursive: true });
  }
});
