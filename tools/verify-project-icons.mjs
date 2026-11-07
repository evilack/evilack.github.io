import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { puppeteer, chromeExecutable } from './browser-runtime.mjs';
import { verificationContext } from './lib/verification.mjs';

const project = await verificationContext('project-icons');
const browser = await puppeteer.launch({ executablePath: chromeExecutable, headless: true, pipe: true });
const audit = [], errors = [];
try {
  for (const language of project.site.localization.languages) for (const width of [320, 390, 1440]) {
    for (const scheme of project.tooling.verification.colorSchemes) for (const script of [true, false]) {
      const context = await browser.createBrowserContext(), page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.setJavaScriptEnabled(script);
      await page.setViewport({ width, height: project.tooling.verification.height, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
      await page.goto(project.origin + project.site.pages.support.routes[language.code] + '?' + project.site.localization.query + '=' + language.code, { waitUntil: 'networkidle0' });
      const selector = script ? '.project-picker' : '.project-fallback-links';
      const icons = await page.$$eval(selector + ' .project-icon', elements => elements.map(image => {
        const box = image.getBoundingClientRect();
        return { src: new URL(image.src).pathname, loaded: image.complete && image.naturalWidth > 0,
          alt: image.getAttribute('alt'), width: box.width, height: box.height };
      }));
      assert.equal(icons.length, project.site.support.projects.length);
      for (const [index, icon] of icons.entries()) {
        assert.ok(icon.loaded); assert.equal(icon.alt, '');
        assert.equal(icon.width, project.site.support.iconSize); assert.equal(icon.height, project.site.support.iconSize);
        assert.equal(icon.src, '/' + project.site.assets[project.site.support.projects[index].icon].output);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
      if (script) {
        // 아이콘 위를 눌러도 라벨의 기본 동작으로 해당 프로젝트가 선택되어야 합니다.
        await page.click('.project-option:last-child .project-icon');
        const last = project.site.support.projects.at(-1);
        assert.equal(await page.$eval('#' + project.site.dom.paymentId, element => element.href), last.payment.url);
      }
      const name = `${language.code}-${width}-${scheme}-${script ? 'interactive' : 'native'}`;
      await (await page.$(selector)).screenshot({ path: project.output + '/' + name + '.png' });
      audit.push({ name, icons });
      await context.close();
    }
  }
  // 기존 PNG 자산을 16/24/32/48px 실제 표시로도 비교할 수 있는 캡처를 남깁니다.
  const page = await browser.newPage();
  await page.goto(project.origin + project.site.pages.support.routes.en + '?lang=en', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const panel = document.querySelector('.project-options');
    const original = [...panel.querySelectorAll('img')].map(image => image.cloneNode());
    panel.replaceChildren();
    for (const size of [16, 24, 32, 48]) {
      const row = document.createElement('div'); row.className = 'project-option';
      const label = document.createElement('span'); label.textContent = size + 'px'; row.append(label);
      for (const image of original) { const copy = image.cloneNode(); copy.width = size; copy.height = size; row.append(copy); }
      panel.append(row);
    }
  });
  for (const scheme of project.tooling.verification.colorSchemes) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    await (await page.$('.project-options')).screenshot({ path: project.output + '/actual-sizes-' + scheme + '.png' });
  }
  assert.deepEqual(errors, []);
  await writeFile(project.output + '/verification.json', JSON.stringify({ passed: audit.length, audit, errors }, null, 2));
  console.log(JSON.stringify({ origin: project.origin, passed: audit.length, errors }));
} finally { await browser.close(); }
