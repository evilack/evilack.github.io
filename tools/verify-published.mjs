import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { puppeteer, chromeExecutable } from './browser-runtime.mjs';
import { verificationContext } from './lib/verification.mjs';
const project = await verificationContext('published', { publicSite: true });
const { origin, output } = project;
const audit=[], assets=[], errors=[];
const manifest = JSON.parse(await readFile(project.resolve(project.tooling.paths.output + '/' + project.tooling.build.manifestFile), 'utf8'));
for (const file of manifest.files) {
  const response=await fetch(origin+file,{headers:{'Cache-Control':'no-cache'}});
  assert.equal(response.status,200,file);
  const actual=Buffer.from(await response.arrayBuffer());
  const expected=await readFile(project.resolve(project.tooling.paths.output + '/' + file));
  assert.deepEqual(actual,expected,`Published source differs: ${file}`);
  assets.push({file,status:response.status,sha256:createHash('sha256').update(actual).digest('hex')});
}
const browser=await puppeteer.launch({executablePath:chromeExecutable,headless:true,pipe:true});
async function inspect(page,lang) {
  const state=await page.evaluate(()=>({lang:document.documentElement.lang,title:document.title,url:location.href,
    nav:[...document.querySelectorAll('.site-header nav a')].map(a=>a.textContent.trim()),
    overflow:document.documentElement.scrollWidth-innerWidth,
    images:[...document.images].every(image=>image.complete&&image.naturalWidth>0),
    paypal:document.querySelector('#paypal-support')?.href}));
  assert.equal(state.lang,lang);
  assert.deepEqual(state.nav,lang==='ko'?['프로젝트','포트폴리오','개발 후원','English']:['Work','Portfolio','Support','한국어']);
  assert.equal(state.overflow,0);
  assert.equal(state.images,true);
  if(state.paypal) assert.equal(state.paypal,'https://www.paypal.com/ncp/payment/U3EX8XP6BREYA');
  return state;
}
async function click(page,selector,lang) {
  await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),page.click(selector)]);
  return inspect(page,lang);
}
try {
  for(const scenario of [
    {name:'Korean browser',languages:['ko-KR','en-US'],expected:'ko'},
    {name:'English browser',languages:['en-US','ko-KR'],expected:'en'},
    {name:'Unsupported browser fallback',languages:['ja-JP','fr-FR'],expected:'en'},
    {name:'Saved manual English overrides browser',languages:['ko-KR'],saved:'en',expected:'en'}
  ]) {
    const context=await browser.createBrowserContext(),page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.evaluateOnNewDocument(({languages,saved})=>{
      Object.defineProperty(navigator,'languages',{get:()=>languages});
      Object.defineProperty(navigator,'language',{get:()=>languages[0]});
      if(saved&&!sessionStorage.getItem('seeded')) {localStorage.setItem('ev-cabinet-language',saved);sessionStorage.setItem('seeded','1');}
    },scenario);
    await page.setViewport({width:390,height:844,deviceScaleFactor:1});
    await page.goto(origin,{waitUntil:'networkidle0'});
    const home=await inspect(page,scenario.expected);
    const support=await click(page,'.support-nav',scenario.expected);
    const alternate=scenario.expected==='ko'?'en':'ko';
    await click(page,'.language-link',alternate);
    await click(page,'.back-link',alternate);
    await page.goto(origin,{waitUntil:'networkidle0'});
    await inspect(page,alternate);
    assert.equal(await page.evaluate(()=>localStorage.getItem('ev-cabinet-language')),alternate);
    audit.push({name:scenario.name,home,support,manualChoiceAfterReturn:alternate});
    await context.close();
  }
  for(const lang of ['en','ko']) for(const width of [320,1440]) {
    const context=await browser.createBrowserContext(),page=await context.newPage();
    await page.setViewport({width,height:1000,deviceScaleFactor:1});
    for(const family of ['home','support']) {
      const file=family==='home'?(lang==='en'?'index.html':'index-ko.html'):(lang==='en'?'donate.html':'donate-ko.html');
      await page.goto(origin+file+'?lang='+lang,{waitUntil:'networkidle0'});
      audit.push({name:`${family}-${lang}-${width}`,...await inspect(page,lang)});
      await page.screenshot({path:`${output}/${family}-${lang}-${width}.png`,fullPage:true});
    }
    await context.close();
  }
  {
    const context=await browser.createBrowserContext(),page=await context.newPage();
    await page.setJavaScriptEnabled(false);
    await page.goto(origin+'donate.html',{waitUntil:'networkidle0'});
    await inspect(page,'en');
    await click(page,'.language-link','ko');
    audit.push({name:'Native support language and PayPal links without JavaScript'});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(output+'/public-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),origin,assets,audit,errors},null,2));
  console.log(JSON.stringify({matchedPublishedFiles:assets.length,browserScenarios:audit.length,errors}));
} finally {await browser.close();}
