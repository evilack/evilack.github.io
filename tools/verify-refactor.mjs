import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { puppeteer, chromeExecutable } from './browser-runtime.mjs';
import { verificationContext } from './lib/verification.mjs';
import { createStaticServer } from './lib/static-server.mjs';

const context = await verificationContext('site-refactor');
const baseline = process.argv[2];
if (!baseline) throw new Error('변경 전 화면 폴더를 인자로 전달해 주세요.');
const original = createStaticServer({ root: path.resolve(baseline, 'website'), host: context.tooling.preview.host, port: 0 });
const originalOrigin = await original.start();
const baselineOutput = path.join(context.output, 'normalized-before');
await mkdir(baselineOutput, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chromeExecutable, headless: true, pipe: true });
const audit = [], errors = [];
try {
  for (const language of context.site.localization.languages) for (const [family, pageConfig] of Object.entries(context.site.pages)) {
    const session = await browser.createBrowserContext();
    const page = await session.newPage();
    page.on('pageerror', error => errors.push(error.message));
    // 테마를 바꿀 때 기존 180ms 전환 중간을 비교하지 않도록 양쪽 모두 모션을 줄입니다.
    const resourcesFor = target => target.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.initiatorType === 'script' && new URL(entry.name).origin === location.origin).map(entry => ({ url: new URL(entry.name).pathname, bytes: entry.decodedBodySize })));
    for (const width of context.tooling.verification.comparisonWidths) for (const scheme of context.tooling.verification.colorSchemes) {
      // 한 탭에서 같은 조건으로 순서대로 촬영하여 백그라운드 탭의 렌더링 중단을 피합니다.
      await page.setViewport({ width, height: context.tooling.verification.height, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
      const name = `${family}-${language.code}-${width}-${scheme}.png`;
      const route = pageConfig.routes[language.code] + '?' + context.site.localization.query + '=' + language.code;
      await page.goto(originalOrigin + route, { waitUntil: 'networkidle0' });
      const beforeResources = await resourcesFor(page);
      const before = PNG.sync.read(Buffer.from(await page.screenshot({ path: path.join(baselineOutput, name), fullPage: true })));
      await page.goto(context.origin + route, { waitUntil: 'networkidle0' });
      const resources = await resourcesFor(page);
      const current = Buffer.from(await page.screenshot({ path: path.join(context.output, name), fullPage: true }));
      const after = PNG.sync.read(current);
      let changed = 0;
      if (before.width === after.width && before.height === after.height) {
        for (let pixel = 0; pixel < before.data.length; pixel += 4) {
          if (!before.data.subarray(pixel, pixel + 4).equals(after.data.subarray(pixel, pixel + 4))) changed++;
        }
      } else changed = Math.max(before.width * before.height, after.width * after.height);
      audit.push({ name, before: { width: before.width, height: before.height }, after: { width: after.width, height: after.height }, changedPixels: changed, resources, beforeResources });
      console.log('Compared', name, changed);
    }
    await session.close();
  }
  await writeFile(path.join(context.output, 'visual-comparison.json'), JSON.stringify({ audit, errors }, null, 2));
  assert.deepEqual(errors, []);
  assert.equal(audit.filter(item => item.changedPixels).length, 0, '원본 화면과 다른 결과는 시각 검수가 필요합니다.');
  console.log(JSON.stringify({ screenshots: audit.length, differing: audit.filter(item => item.changedPixels).map(item => ({ name: item.name, pixels: item.changedPixels, before: item.before, after: item.after })), scriptResources: audit.filter(item => item.name.endsWith('-1440-dark.png')).map(item => ({ page: item.name, scripts: item.resources })) }));
} finally { await browser.close(); await original.close(); }
