import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { puppeteer, chromeExecutable } from './browser-runtime.mjs';
import { verificationContext } from './lib/verification.mjs';
const project = await verificationContext('home-support');
const { origin, output } = project;
const browser=await puppeteer.launch({executablePath:chromeExecutable,headless:true,pipe:true});
const audit=[],errors=[];
try {
  for(const lang of ['ko','en']) for(const width of [320,390,1440]) for(const scheme of ['light','dark']) {
    const context=await browser.createBrowserContext(),page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.setViewport({width,height:1000,deviceScaleFactor:1});
    await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:scheme}]);
    await page.goto(origin+(lang==='ko'?'index-ko.html':'index.html')+'?lang='+lang,{waitUntil:'networkidle0'});
    const state=await page.$eval('main .home-support',section=>{
      const link=section.querySelector('a'),r=link.getBoundingClientRect();
      const cardStyle=getComputedStyle(section.querySelector('.home-support-card'));
      return {lang:document.documentElement.lang,heading:section.querySelector('h2').textContent,
        copy:section.textContent.trim(),href:link.href,button:{width:r.width,height:r.height,left:r.left,right:r.right},
        overflow:document.documentElement.scrollWidth-innerWidth,
        insideMain:section.closest('main')!==null,
        cardDisplay:cardStyle.display,cardBackground:cardStyle.backgroundColor};
    });
    assert.equal(state.lang,lang);
    assert.equal(state.insideMain,true);
    assert.equal(state.cardDisplay,'grid','The support card stylesheet must be loaded');
    assert.notEqual(state.cardBackground,'rgba(0, 0, 0, 0)');
    assert.equal(state.overflow,0);
    assert.equal(new URL(state.href).pathname,lang==='ko'?'/donate-ko.html':'/donate.html');
    assert.ok(state.button.width>=44&&state.button.height>=44);
    assert.ok(state.button.left>=0&&state.button.right<=width);
    await (await page.$('.home-support')).screenshot({path:`${output}/support-${lang}-${width}-${scheme}.png`});
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),page.click('.home-support a')]);
    assert.equal(await page.$eval('html',html=>html.lang),lang);
    assert.equal(await page.$eval('#paypal-support',a=>a.href),'https://www.paypal.com/ncp/payment/U3EX8XP6BREYA');
    audit.push({lang,width,scheme,...state,destination:page.url()});
    await context.close();
  }
  for(const lang of ['ko','en']) {
    const context=await browser.createBrowserContext(),page=await context.newPage();
    await page.setJavaScriptEnabled(false);
    await page.goto(origin+(lang==='ko'?'index-ko.html':'index.html'),{waitUntil:'networkidle0'});
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),page.click('.home-support a')]);
    assert.equal(await page.$eval('html',html=>html.lang),lang);
    audit.push({lang,name:'Native support link without JavaScript',destination:page.url()});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(output+'/verification.json',JSON.stringify({checkedAt:new Date().toISOString(),origin,passed:audit.length,audit,errors},null,2));
  console.log(JSON.stringify({origin,passed:audit.length,errors}));
} finally {await browser.close();}
