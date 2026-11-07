import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { puppeteer, chromeExecutable } from './browser-runtime.mjs';

import { verificationContext } from './lib/verification.mjs';
const project = await verificationContext('homepage');
const { origin, output } = project;
const browser = await puppeteer.launch({ executablePath: chromeExecutable, headless: !process.env.HEADED, pipe: true });
const audit = [];
const errors = [];
async function setup({ languages = ['en-US'], saved, blocked = false, script = true } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(origin) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.setJavaScriptEnabled(script);
  await page.evaluateOnNewDocument(({ languages, saved, blocked }) => {
    Object.defineProperty(navigator, 'languages', { get: () => languages });
    Object.defineProperty(navigator, 'language', { get: () => languages[0] || '' });
    if (blocked) Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    else if (saved && !sessionStorage.getItem('seeded')) {
      localStorage.setItem('ev-cabinet-language', saved);
      sessionStorage.setItem('seeded', '1');
    }
  }, { languages, saved, blocked });
  return { context, page };
}
async function visit(page, path, lang) {
  await page.goto(origin + path, { waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('html', e => e.lang), lang, path);
}
async function click(page, selector, lang) {
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click(selector)]);
  assert.equal(await page.$eval('html', e => e.lang), lang, selector);
}
try {
  for (const scenario of [
    { name: 'Korean browser', languages: ['ko-KR', 'en-US'], path: '', lang: 'ko' },
    { name: 'English browser', languages: ['en-GB', 'ko-KR'], path: 'index-ko.html', lang: 'en' },
    { name: 'Unsupported fallback', languages: ['ja-JP', 'fr-FR'], path: 'index-ko.html', lang: 'en' },
    { name: 'Missing language fallback', languages: [], path: '', lang: 'en' },
    { name: 'First supported browser language', languages: ['de-DE', 'ko-KR', 'en-US'], path: '', lang: 'ko' },
    { name: 'Saved manual choice', languages: ['ko-KR'], saved: 'en', path: '', lang: 'en' },
    { name: 'URL overrides saved choice', languages: ['en-US'], saved: 'en', path: 'index.html?lang=ko&source=check#about', lang: 'ko' },
  ]) {
    const { context, page } = await setup(scenario);
    await visit(page, scenario.path, scenario.lang);
    if (scenario.path.includes('#about')) assert.ok(page.url().endsWith('?lang=ko&source=check#about'));
    audit.push({ name: scenario.name, url: page.url(), lang: scenario.lang });
    await context.close();
  }
  for (const lang of ['en', 'ko']) {
    if (process.env.ROUTING_ONLY) break;
    const { context, page } = await setup({ languages: [lang] });
    for (const family of ['home', 'support']) for (const width of [320, 390, 768, 1024, 1440]) for (const scheme of ['light', 'dark']) {
      await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
      const file = project.site.pages[family].routes[lang];
      await visit(page, file, lang);
      const state = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        images: [...document.images].every(img => img.complete && img.naturalWidth > 0),
        h1s: document.querySelectorAll('h1').length,
        title: document.title,
        controls: [...document.querySelectorAll('.site-header nav a')].map(a => {
          const r = a.getBoundingClientRect(); return { text:a.textContent.trim(), width:r.width, height:r.height, left:r.left, right:r.right };
        }),
        paypal: document.querySelector('#paypal-support')?.href,
        portfolio: [...document.links].filter(a => a.href === 'https://evilack.github.io/portfolio/').length,
        localLinks: [...document.querySelectorAll('a[href],link[rel="stylesheet"],script[src],img[src]')].map(e => e.href || e.src).filter(url => url.startsWith(location.origin)),
      }));
      assert.equal(state.overflow, 0, `${file} ${width} ${scheme} overflows`);
      assert.equal(state.images, true);
      assert.equal(state.h1s, 1);
      for (const control of state.controls) {
        assert.ok(control.width >= 24 && control.height >= 24, `Unreachable control ${control.text}`);
        assert.ok(control.left >= 0 && control.right <= width, `Clipped control ${control.text}`);
      }
      if (family === 'home') assert.ok(state.portfolio >= 3);
      else assert.equal(state.paypal, 'https://www.paypal.com/ncp/payment/U3EX8XP6BREYA');
      for (const url of new Set(state.localLinks)) assert.equal((await fetch(url)).status, 200, url);
      const name = `${family}-${lang}-${width}-${scheme}`;
      if ([320,390,1440].includes(width)) await page.screenshot({path:`${output}/${name}.png`, fullPage:true});
      audit.push({ name, ...state, localLinks: undefined });
    }
    await context.close();
  }
  for (const script of [true, false]) {
    const { context, page } = await setup({ languages:['en-US'], script });
    await visit(page, '', 'en');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
    await page.keyboard.press('Enter');
    assert.ok(page.url().endsWith('#main'));
    await click(page, '.language-link', 'ko');
    await click(page, '.support-nav', 'ko');
    await click(page, '.back-link', 'ko');
    if (script) {
      assert.equal(await page.evaluate(() => localStorage.getItem('ev-cabinet-language')), 'ko');
      await visit(page, '', 'ko');
      const second = await context.newPage();
      await visit(second, 'donate.html', 'ko');
      await second.close();
      await click(page, '.language-link', 'en');
      await visit(page, 'index-ko.html', 'en');
    }
    audit.push({name:script?'Manual choice across home/support, reload and new tab':'Native language and support links without JavaScript'});
    await context.close();
  }
  {
    const { context, page } = await setup({ languages:['ko-KR'], blocked:true });
    await visit(page, '', 'ko');
    await click(page, '.language-link', 'en');
    await click(page, '.support-nav', 'en');
    await click(page, '.back-link', 'en');
    audit.push({name:'Explicit manual language across home/support with storage denied'});
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/${process.env.ROUTING_ONLY ? 'routing-verification' : 'verification'}.json`, JSON.stringify({checkedAt:new Date().toISOString(), passed:audit.length, audit, errors},null,2));
  console.log(JSON.stringify({passed:audit.length, errors}));
} finally { await browser.close(); }
