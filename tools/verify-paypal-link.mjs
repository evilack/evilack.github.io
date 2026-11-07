import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { puppeteer, chromeExecutable } from './browser-runtime.mjs';
import { verificationContext } from './lib/verification.mjs';
const project = await verificationContext('paypal-link');
const { origin, output } = project;
const target = project.site.support.projects.find(item => item.id === project.site.support.defaultProject).payment.url;
const browser = await puppeteer.launch({ executablePath: chromeExecutable,
  headless: true, pipe: true });
const audit = [];
try {
  for (const locale of ['en', 'ko']) for (const [layout, width, script] of [['desktop',1440,true],['mobile',390,true],['no-script',390,false]]) {
    const name = `${locale}-${layout}`;
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
    await page.setJavaScriptEnabled(script);
    await page.goto(`${origin}${project.site.pages.support.routes[locale]}?lang=${locale}`, { waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('html', html => html.lang), locale);
    const result = await page.$eval('#paypal-support', link => ({ tag: link.tagName, href: link.href,
      linkText: link.textContent, width: innerWidth, documentWidth: document.documentElement.scrollWidth,
      pendingNotice: document.body.textContent.includes('PayPal 연결 준비 중'),
      amountInputs: document.querySelectorAll('input[name="amount"],#custom-usd').length }));
    assert.equal(result.tag, 'A', 'Payment destination must work as a native link without JavaScript');
    assert.equal(result.href, target, 'Must point to the actual merchant link created in PayPal');
    assert.equal(result.pendingNotice, false);
    assert.equal(result.amountInputs, 0, 'Amount is entered on the real customer-priced PayPal page');
    assert.equal(result.width, result.documentWidth);
    await (await page.$('.donation-card')).screenshot({ path: `${output}/donation-${name}.png` });
    // Verify the browser actually follows the native link; stop before any external checkout loads.
    let attempted;
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.isNavigationRequest() && request.url() === target) {
        attempted = request.url();
        void request.abort();
      } else void request.continue();
    });
    const navigation = page.waitForRequest(request => request.isNavigationRequest() && request.url() === target, { timeout: 5000 });
    if (script) await page.click('#paypal-support');
    else {
      await (await page.$('#paypal-support')).focus();
      await page.keyboard.press('Enter');
    }
    await navigation;
    assert.equal(attempted, target);
    assert.deepEqual(errors, []);
    audit.push({ name, script, ...result, navigationAttempted: attempted, errors });
    console.log('PASS', name);
    await page.close();
  }
  await writeFile(`${output}/website-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), audit }, null, 2));
  console.log(JSON.stringify({ passed: audit.length, audit }));
} finally { await browser.close(); }
