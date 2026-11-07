import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectPolicy } from '../src/runtime/policies.js';
import { readFileSync } from 'node:fs';
const settings=JSON.parse(readFileSync(new URL('../src/data/site.json',import.meta.url),'utf8'));
const policy=new ProjectPolicy(settings.support);
const feature={getSupportProject:value=>({paypal:policy.get(value).payment.url}),preferredSupportProject:(url,saved)=>policy.select({url,saved})};
test('default checkout keeps the existing shared support destination', () => {
  assert.equal(feature.getSupportProject?.('all')?.paypal, 'https://www.paypal.com/ncp/payment/U3EX8XP6BREYA');
});
test('QuietMic selection uses its real project-specific PayPal item', () => {
  assert.equal(feature.getSupportProject?.('quietmic')?.paypal, 'https://www.paypal.com/ncp/payment/WWM6KYZ4E3S2W');
});
test('MDownloader selection uses its real project-specific PayPal item', () => {
  assert.equal(feature.getSupportProject?.('mdownloader')?.paypal, 'https://www.paypal.com/ncp/payment/8SAZVLEDCZFNU');
});
test('explicit project overrides a saved preference', () => {
  assert.equal(feature.preferredSupportProject?.('https://example.test/donate.html?lang=en&project=mdownloader','quietmic'), 'mdownloader');
});
test('saved project survives language page changes without a project query', () => {
  assert.equal(feature.preferredSupportProject?.('https://example.test/donate-ko.html?lang=ko','quietmic'), 'quietmic');
});
test('invalid project cannot redirect payments to an arbitrary destination', () => {
  assert.equal(feature.getSupportProject?.('https://example.invalid/pay')?.paypal, 'https://www.paypal.com/ncp/payment/U3EX8XP6BREYA');
  assert.equal(feature.preferredSupportProject?.('https://example.test/donate.html?project=bad','invalid'), 'all');
});
test('missing or inaccessible storage can use URL choice and the shared default', () => {
  assert.equal(feature.preferredSupportProject?.('https://example.test/donate.html?project=quietmic',null), 'quietmic');
  assert.equal(feature.preferredSupportProject?.('https://example.test/donate.html',null), 'all');
});
