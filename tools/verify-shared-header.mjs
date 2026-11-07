import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { puppeteer, chromeExecutable } from './browser-runtime.mjs';

import { verificationContext } from './lib/verification.mjs';
const project = await verificationContext('shared-header');
const { origin, output } = project;
const browser = await puppeteer.launch({ executablePath:chromeExecutable, headless:true, pipe:true });
const audit = [], errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  for (const lang of ['ko', 'en']) for (const width of [320, 390, 1440]) for (const scheme of ['light', 'dark']) {
    await page.setViewport({ width, height:900, deviceScaleFactor:1 });
    await page.emulateMediaFeatures([{ name:'prefers-color-scheme', value:scheme }]);
    const states = [];
    for (const family of ['home', 'support']) {
      const file = project.site.pages[family].routes[lang];
      await page.goto(`${origin}${file}?lang=${lang}`, { waitUntil:'networkidle0' });
      const state = await page.$eval('.site-header', header => {
        const box = e => { const r=e.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; };
        const nav = header.querySelector('nav');
        return { header:box(header), nav:box(nav), overflow:document.documentElement.scrollWidth-innerWidth,
          links:[...nav.querySelectorAll('a')].map(a => {
            const style=getComputedStyle(a);
            return {text:a.textContent.trim(), href:a.href, box:box(a), fontSize:style.fontSize, gap:style.gap, color:style.color};
          }), current:nav.querySelector('[aria-current="page"]')?.textContent.trim() };
      });
      assert.equal(state.overflow,0);
      assert.deepEqual(state.links.map(link => link.text), lang === 'ko'
        ? ['프로젝트', '포트폴리오', '개발 후원', 'English']
        : ['Work', 'Portfolio', 'Support', '한국어']);
      for (const link of state.links) {
        assert.ok(link.box.width>=24 && link.box.height>=24,link.text);
        assert.ok(link.box.x>=0 && link.box.x+link.box.width<=width,link.text);
      }
      if (family==='support') assert.equal(state.current,lang==='ko'?'개발 후원':'Support');
      else assert.equal(state.current,undefined);
      await (await page.$('.site-header')).screenshot({path:`${output}/${family}-${lang}-${width}-${scheme}.png`});
      delete state.current;
      // The language control stays on its current page family when switching language.
      state.links.at(-1).href = 'current-family-language-switch';
      states.push(state);
    }
    assert.deepEqual(states[1],states[0],`${lang} ${width} ${scheme}: headers must match in layout, labels, links and typography`);
    audit.push({lang,width,scheme,...states[0]});
  }
  assert.deepEqual(errors,[]);
  await writeFile(output+'/verification.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:audit.length,audit,errors},null,2));
  console.log(JSON.stringify({passed:audit.length,errors}));
} finally { await browser.close(); }
