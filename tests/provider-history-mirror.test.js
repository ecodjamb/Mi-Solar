import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const providerStore=readFileSync(new URL('../server/providerStore.js',import.meta.url),'utf8');
const nav=readFileSync(new URL('../src/components/MobileNav.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');

assert.match(providerStore,/providerHistorySeries/);
assert.match(providerStore,/canonicalToLegacy/);
assert.match(providerStore,/pvInputPower1/);
assert.match(providerStore,/pvInputPower2/);
assert.match(providerStore,/await storeSession\(account, activeSession\)/);
assert.match(app,/fetchProviderRawHistory/);
assert.match(app,/provider=\{source\}/);
assert.doesNotMatch(nav,/visualViewport/);
assert.match(css,/\.mobile-nav\{[\s\S]*position:absolute!important;/);

console.log('provider history mirror tests passed');
