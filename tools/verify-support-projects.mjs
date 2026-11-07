import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { puppeteer, chromeExecutable } from './browser-runtime.mjs';
import { verificationContext } from './lib/verification.mjs';
const project = await verificationContext('support-projects');
const { origin, output } = project;
const targets = Object.fromEntries(project.site.support.projects.map(item => [item.id, item.payment.url]));
const browser=await puppeteer.launch({executablePath:chromeExecutable,headless:true,pipe:true});
const audit=[],errors=[];
async function setup({blocked=false,script=true}={}) {
  const context=await browser.createBrowserContext(),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.setJavaScriptEnabled(script);
  if(blocked)await page.evaluateOnNewDocument(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage blocked','SecurityError');}}));
  return {context,page};
}
async function visit(page,lang,query='') {
  await page.goto(origin+(lang==='ko'?'donate-ko.html':'donate.html')+'?lang='+lang+query,{waitUntil:'networkidle0'});
  assert.equal(await page.$eval('html',html=>html.lang),lang);
}
async function selected(page,id) {
  assert.equal(await page.$eval('#paypal-support',a=>a.href),targets[id]);
  assert.equal(await page.$eval('input[name="support-project"]:checked',input=>input.value),id);
}
async function attempt(page,selector,target) {
  let attempted;
  await page.setRequestInterception(true);
  page.on('request',request=>{
    if(request.isNavigationRequest()&&request.url().startsWith('https://www.paypal.com/')) {attempted=request.url();void request.abort();}
    else void request.continue();
  });
  const navigation=page.waitForRequest(request=>request.isNavigationRequest()&&request.url()===target,{timeout:5000});
  await page.click(selector);
  await navigation;
  assert.equal(attempted,target);
}
try {
  for(const lang of ['ko','en'])for(const width of [320,390,1440])for(const scheme of ['light','dark']) {
    const {context,page}=await setup();
    await page.setViewport({width,height:1000,deviceScaleFactor:1});
    await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:scheme}]);
    await visit(page,lang);
    await selected(page,'all');
    assert.equal(await page.$eval('#support-project-picker',e=>e.hidden),false);
    assert.equal(await page.$eval('#project-fallback-links',e=>e.hidden),true);
    for(const id of ['quietmic','mdownloader','all']) {
      await page.click(`label[for="project-${id}"]`);
      await selected(page,id);
    }
    const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,
      rows:[...document.querySelectorAll('.project-option')].map(label=>{const r=label.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right,font:getComputedStyle(label).fontSize};})}));
    assert.equal(layout.overflow,0);
    for(const row of layout.rows){assert.ok(row.height>=48);assert.ok(row.left>=0&&row.right<=width);assert.equal(row.font,'16px');}
    await page.click('label[for="project-mdownloader"]');
    await (await page.$('.donation-card')).screenshot({path:`${output}/card-${lang}-${width}-${scheme}.png`});
    audit.push({name:`${lang}-${width}-${scheme}`,...layout});
    await context.close();
  }
  {
    const {context,page}=await setup();
    await visit(page,'ko');await page.click('#project-quietmic');
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),page.click('.language-link')]);
    await selected(page,'quietmic');
    assert.equal(await page.$eval('html',e=>e.lang),'en');
    await page.click('#project-mdownloader');await page.reload({waitUntil:'networkidle0'});await selected(page,'mdownloader');
    await visit(page,'ko');await selected(page,'mdownloader');
    await visit(page,'ko','&project=quietmic');await selected(page,'quietmic');
    assert.equal(await page.evaluate(()=>localStorage.getItem('ev-cabinet-support-project')),'quietmic');
    audit.push({name:'Project persists across language, reload and return; URL overrides saved choice'});
    await context.close();
  }
  {
    const {context,page}=await setup({blocked:true});
    await visit(page,'ko','&project=quietmic');await selected(page,'quietmic');await page.click('#project-mdownloader');
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),page.click('.language-link')]);
    await selected(page,'mdownloader');await page.reload({waitUntil:'networkidle0'});await selected(page,'mdownloader');
    audit.push({name:'Storage denial retains explicit choice across language and reload'});await context.close();
  }
  {
    const {context,page}=await setup();await visit(page,'en','&project=all');
    await page.focus('#project-all');await page.keyboard.press('ArrowDown');await selected(page,'quietmic');
    assert.notEqual(await page.$eval('.project-option:focus-within',e=>getComputedStyle(e).outlineStyle),'none');
    audit.push({name:'Native arrow-key radio choice and visible focus'});await context.close();
  }
  for(const lang of ['ko','en'])for(const id of ['all','quietmic','mdownloader']) {
    const {context,page}=await setup();await visit(page,lang,'&project='+id);await selected(page,id);
    await attempt(page,'#paypal-support',targets[id]);audit.push({name:`Native payment navigation ${lang}/${id}`,destination:targets[id]});await context.close();
    const fallback=await setup({script:false});await visit(fallback.page,lang);
    assert.equal(await fallback.page.$eval('#support-project-picker',e=>e.hidden),true);
    assert.equal(await fallback.page.$eval('#project-fallback-links',e=>e.hidden),false);
    await attempt(fallback.page,`[data-direct-project="${id}"]`,targets[id]);
    audit.push({name:`No-script project payment navigation ${lang}/${id}`,destination:targets[id]});await fallback.context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(output+'/verification.json',JSON.stringify({checkedAt:new Date().toISOString(),origin,passed:audit.length,audit,errors},null,2));
  console.log(JSON.stringify({origin,passed:audit.length,errors}));
} finally {await browser.close();}
