import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { puppeteer, chromeExecutable } from './browser-runtime.mjs';
import { verificationContext } from './lib/verification.mjs';
const project = await verificationContext('support-locale');
const { origin, output } = project;
const storageKey = project.site.localization.storage;
const browser = await puppeteer.launch({ executablePath: chromeExecutable,
  headless: true, pipe: true });
const audit = [];

async function setup({ languages = ['en-US'], language = languages[0] ?? '', saved, blocked = false } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const script = await page.evaluateOnNewDocument(({ languages, language, saved, blocked, storageKey }) => {
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => languages });
    Object.defineProperty(navigator, 'language', { configurable: true, get: () => language });
    if (blocked) Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    else if (saved !== undefined && !sessionStorage.getItem('locale-test-seeded')) {
      localStorage.setItem(storageKey, saved);
      sessionStorage.setItem('locale-test-seeded', '1');
    }
  }, { languages, language, saved, blocked, storageKey });
  return { page, context, errors, script };
}

async function visit(page, path, expected) {
  await page.goto(origin + path, { waitUntil: 'networkidle0' });
  const result = await page.evaluate(() => ({ lang: document.documentElement.lang, url: location.href,
    title: document.title, overflow: document.documentElement.scrollWidth - innerWidth,
    paypal: document.querySelector('#paypal-support')?.href }));
  assert.equal(result.lang, expected, `${path} must select ${expected}`);
  assert.equal(result.overflow, 0);
  assert.equal(result.paypal, 'https://www.paypal.com/ncp/payment/U3EX8XP6BREYA');
  return result;
}

try {
  const scenarios = [
    { name: 'Korean browser', languages: ['ko-KR','en-US'], path: 'donate-en.html', expected: 'ko' },
    { name: 'English browser', languages: ['en-GB','ko-KR'], path: 'donate.html', expected: 'en' },
    { name: 'Unsupported defaults to English', languages: ['ja-JP','fr-FR'], path: 'donate.html', expected: 'en' },
    { name: 'First supported language', languages: ['fr-FR','ko-KR','en-US'], path: 'donate-en.html', expected: 'ko' },
    { name: 'English preference before Korean', languages: ['en-US','ko-KR'], path: 'donate.html', expected: 'en' },
    { name: 'Legacy single language fallback', languages: [], language: 'ko-KR', path: 'donate-en.html', expected: 'ko' },
    { name: 'Missing locale defaults to English', languages: [], language: '', path: 'donate.html', expected: 'en' },
    { name: 'Saved explicit choice wins', languages: ['ko-KR'], saved: 'en', path: 'donate.html', expected: 'en' },
    { name: 'URL choice overrides saved choice', languages: ['en-US'], saved: 'en', path: 'donate-en.html?lang=ko', expected: 'ko' },
    { name: 'Invalid preferences are ignored', languages: ['ja-JP'], saved: 'bad', path: 'donate.html?lang=bad', expected: 'en' },
    { name: 'Blocked storage still auto selects', languages: ['ko-KR'], blocked: true, path: 'donate-en.html', expected: 'ko' },
    { name: 'Explicit choice with blocked storage', languages: ['ko-KR'], blocked: true, path: 'donate.html?lang=en', expected: 'en' },
  ];
  for (const scenario of scenarios) {
    const { page, context, errors } = await setup(scenario);
    let navigations = 0;
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
    const result = await visit(page, scenario.path, scenario.expected);
    assert.ok(navigations <= 2, 'No locale redirect loop');
    assert.deepEqual(errors, []);
    audit.push({ name: scenario.name, ...result, navigations });
    if (scenario.name === 'Korean browser' || scenario.name === 'English browser') {
      await page.screenshot({ path: `${output}/${scenario.expected}-browser.png`, fullPage: true });
    }
    await context.close();
  }
  {
    const { page, context, errors } = await setup({ languages: ['ko-KR'] });
    await visit(page, 'donate-en.html', 'ko');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('.language-link')]);
    assert.equal(await page.$eval('html', html => html.lang), 'en');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), 'en');
    await visit(page, 'donate-en.html', 'en');
    await visit(page, 'donate.html', 'en');
    assert.deepEqual(errors, []);
    audit.push({ name: 'Manual English selection survives return and other locale URL', lang: 'en' });
    await context.close();
  }
  {
    const { page, context } = await setup();
    await page.setJavaScriptEnabled(false);
    await visit(page, 'donate-en.html', 'en');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('.language-link')]);
    assert.equal(await page.$eval('html', html => html.lang), 'ko');
    audit.push({ name: 'English default and native switch without JavaScript' });
    await context.close();
  }
  {
    const { page, context, script, errors } = await setup({ languages: ['en-US'] });
    await visit(page, 'donate-en.html?source=shared#donation-title', 'en');
    await page.removeScriptToEvaluateOnNewDocument(script.identifier);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR'] });
      Object.defineProperty(navigator, 'language', { get: () => 'ko-KR' });
    });
    const changed = page.waitForNavigation({ waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR'] });
      window.dispatchEvent(new Event('languagechange'));
    });
    await changed;
    assert.equal(await page.$eval('html', html => html.lang), 'ko');
    assert.ok(page.url().includes('source=shared#donation-title'));
    assert.deepEqual(errors, []);
    audit.push({ name: 'Live browser language change preserves query and fragment' });
    await context.close();
  }
  await writeFile(`${output}/verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), audit }, null, 2));
  console.log(JSON.stringify({ passed: audit.length, audit }));
} finally { await browser.close(); }
