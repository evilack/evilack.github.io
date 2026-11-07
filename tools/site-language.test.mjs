import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { LocaleController } from '../src/runtime/locale-controller.js';
import { PreferenceStore } from '../src/runtime/preferences.js';
const config=JSON.parse(readFileSync(new URL('../src/data/site.json',import.meta.url),'utf8'));
// Node에는 실제 DOM이 없으므로 초기 이동에 필요한 브라우저 경계만 제공합니다.
// 링크/라디오/키보드 동작은 별도의 실제 Chrome 검증에서 확인합니다.
function route({family='home',lang='en',url='https://example.test/index.html',languages=['ko-KR'],saved,blocked=false}={}) {
 const events=new Map(),store=new Map(saved?[[config.localization.storage,saved]]:[]);
 let destination;
 const browser={
  document:{documentElement:{lang,dataset:{page:family}}},
  location:{href:url,replace(value){destination=value;}},
  navigator:{languages,language:languages[0]},
  addEventListener(name,handler){events.set(name,handler);}
 };
 const preferences=new PreferenceStore(()=>{if(blocked)throw new Error('Storage denied');return {getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)};});
 const controller=new LocaleController(config,browser,preferences);
 controller.start();
 return {get destination(){return destination;},get saved(){return store.get(config.localization.storage);},setSaved(value){store.set(config.localization.storage,value);},restore(){events.get('pageshow')?.();}};
}
test('home uses Korean browser preferences and preserves query/fragment', () => {
  assert.equal(route({ url: 'https://example.test/index.html?source=home#about' }).destination,
    'https://example.test/index-ko.html?source=home#about');
});
test('saved English overrides Korean browser', () => assert.equal(route({ saved: 'en' }).destination, undefined));
test('explicit URL overrides saved English and is remembered', () => {
  const result = route({ url: 'https://example.test/index.html?lang=ko', saved: 'en' });
  assert.equal(result.destination, 'https://example.test/index-ko.html?lang=ko');
  assert.equal(result.saved, 'ko');
});
test('ordered mixed languages choose first supported preference', () => {
  assert.equal(route({ languages: ['fr-FR', 'KO-kr', 'en-US'] }).destination, 'https://example.test/index-ko.html');
  assert.equal(route({ languages: ['en-GB', 'ko-KR'] }).destination, undefined);
});
test('unsupported and missing languages use English', () => {
  for (const languages of [['ja-JP', 'fr-FR'], []]) {
    assert.equal(route({ lang: 'ko', languages, url: 'https://example.test/index-ko.html' }).destination, 'https://example.test/index.html');
  }
});
test('blocked storage still supports automatic and explicit choices', () => {
  assert.equal(route({ blocked: true }).destination, 'https://example.test/index-ko.html');
  assert.equal(route({ blocked: true, url: 'https://example.test/index.html?lang=en' }).destination, undefined);
});
test('support uses same preference and preserves URL', () => {
  assert.equal(route({ family: 'support', url: 'https://example.test/donate.html?from=home#donation-title' }).destination,
    'https://example.test/donate-ko.html?from=home#donation-title');
});
test('invalid saved/URL preferences do not block browser choice', () => {
  assert.equal(route({ saved: 'bad', url: 'https://example.test/index.html?lang=bad' }).destination,
    'https://example.test/index-ko.html?lang=bad');
});
test('old product and sample families have no routing authority', () => {
  for (const family of ['product', 'sample']) assert.equal(route({ family }).destination, undefined);
});
test('cached Back restoration re-evaluates the saved manual choice', () => {
  const page = route({ lang: 'ko', url: 'https://example.test/index-ko.html' });
  page.setSaved('en');
  page.restore();
  assert.equal(page.destination, 'https://example.test/index.html');
});
test('cached explicit URL retains priority over a different saved choice', () => {
  const page = route({ lang: 'ko', url: 'https://example.test/index-ko.html?lang=ko' });
  page.setSaved('en');
  page.restore();
  assert.equal(page.destination, undefined);
});
