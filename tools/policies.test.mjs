import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const data=JSON.parse(await readFile(new URL('../src/data/site.json',import.meta.url),'utf8'));
const module=await import('../src/runtime/policies.js').catch(error=>error.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(error));
function language(config=data){return module.LanguagePolicy?new module.LanguagePolicy(config.localization,config.pages):null;}
function projects(config=data){return module.ProjectPolicy?new module.ProjectPolicy(config.support):null;}
test('ordered browser preference chooses the first supported regional language',()=>{
  assert.equal(language()?.select({url:'https://test.invalid/index.html',languages:['fr-FR','KO-kr','en-US']}),'ko');
});

test('configured regional tags keep their spelling and match URL, saved and browser choices',()=>{
  const config=structuredClone(data);config.localization.languages.push({code:'pt-BR',name:'Português'});
  const policy=language(config);
  assert.equal(policy.explicit('https://test.invalid/?lang=PT-br'),'pt-BR');
  assert.equal(policy.select({url:'https://test.invalid/',saved:'pt-br',languages:['ko-KR']}),'pt-BR');
  assert.equal(policy.select({url:'https://test.invalid/',languages:['pt-BR','ko-KR']}),'pt-BR');
  assert.equal(policy.select({url:'https://test.invalid/',languages:['en-GB','pt-BR']}),'en');
});
test('explicit URL then saved choice outrank browser language',()=>{
  assert.equal(language()?.select({url:'https://test.invalid/?lang=ko',saved:'en',languages:['en']}),'ko');
  assert.equal(language()?.select({url:'https://test.invalid/',saved:'en',languages:['ko']}),'en');
});
test('default language is read from data rather than an English constant',()=>{
  const config=structuredClone(data);config.localization.default='ko';
  assert.equal(language(config)?.select({url:'https://test.invalid/',languages:['ja-JP']}),'ko');
});
test('route changes from data and preserves query and fragment',()=>{
  const config=structuredClone(data);config.pages.home.routes.ko='korean.html';
  assert.equal(language(config)?.destination({url:'https://test.invalid/index.html?source=card#support',family:'home',currentLanguage:'en',languages:['ko']}),
    'https://test.invalid/korean.html?source=card#support');
});
test('selected project uses its verified provider destination',()=>{
  assert.equal(projects()?.get('quietmic')?.payment.url,'https://www.paypal.com/ncp/payment/WWM6KYZ4E3S2W');
  assert.equal(projects()?.get('mdownloader')?.payment.url,'https://www.paypal.com/ncp/payment/8SAZVLEDCZFNU');
});
test('untrusted project input cannot become a payment URL',()=>{
  assert.equal(projects()?.get('https://malicious.invalid')?.payment.url,'https://www.paypal.com/ncp/payment/U3EX8XP6BREYA');
});
test('project and preference query keys can change through data only',()=>{
  const config=structuredClone(data);config.support.query='cheer';config.support.defaultProject='quietmic';
  assert.equal(projects(config)?.select({url:'https://test.invalid/?cheer=mdownloader',saved:'quietmic'}),'mdownloader');
  assert.equal(projects(config)?.select({url:'https://test.invalid/?project=mdownloader'}),'quietmic');
});
test('explicit project wins over saved choice, while saved choice survives ordinary visits',()=>{
  assert.equal(projects()?.select({url:'https://test.invalid/?project=quietmic',saved:'mdownloader'}),'quietmic');
  assert.equal(projects()?.select({url:'https://test.invalid/',saved:'mdownloader'}),'mdownloader');
});
