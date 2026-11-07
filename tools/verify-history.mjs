import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { puppeteer, chromeExecutable } from './browser-runtime.mjs';
import { verificationContext } from './lib/verification.mjs';
import { createStaticServer } from './lib/static-server.mjs';

// 빈 포트의 임시 서버에서 실제 BFCache 복원을 확인합니다. 고정 포트의 서버와 충돌하지 않습니다.
const project = await verificationContext('history');
const server = createStaticServer({ root: project.resolve(project.tooling.paths.output), host: project.tooling.preview.host, port: 0 });
const origin = (await server.start()).replace(/\/$/, '');
let browser;
const audit = [];
try {
  browser = await puppeteer.launch({ executablePath:chromeExecutable, headless:true, pipe:true,
    ignoreDefaultArgs:['--disable-back-forward-cache'] });
  for (const explicit of [false, true]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'languages', { get:() => ['ko-KR'] });
      addEventListener('pageshow', event => {
        if (event.persisted) sessionStorage.setItem('history-cache-restored','true');
      });
    });
    await page.goto(origin + '/index-ko.html' + (explicit ? '?lang=ko' : ''), {waitUntil:'networkidle0'});
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}), page.click('.language-link')]);
    assert.equal(await page.$eval('html', e => e.lang), 'en');
    await page.goBack({waitUntil:'load'});
    const expected = explicit ? 'ko' : 'en';
    await page.waitForFunction(lang => document.documentElement.lang === lang, {timeout:4000}, expected);
    const result = await page.evaluate(() => ({ lang:document.documentElement.lang,
      saved:localStorage.getItem('ev-cabinet-language'), cachedRestore:sessionStorage.getItem('history-cache-restored'), url:location.href }));
    assert.equal(result.cachedRestore, 'true', 'Must exercise actual browser Back/forward cache');
    assert.equal(result.lang, expected);
    assert.equal(result.saved, expected);
    audit.push({explicit,...result});
    await context.close();
  }
  const { output } = project;
  await writeFile(output+'/history-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:audit.length,audit},null,2));
  console.log(JSON.stringify({passed:audit.length,audit}));
} finally {
  await browser?.close();
  await server.close();
}
