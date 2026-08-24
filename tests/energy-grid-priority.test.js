import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const energy=readFileSync(new URL('../src/utils/energy.ts',import.meta.url),'utf8');
const coverage=readFileSync(new URL('../src/components/LoadCoverageBar.tsx',import.meta.url),'utf8');
const costs=readFileSync(new URL('../src/components/CostsPage.tsx',import.meta.url),'utf8');

assert.match(energy,/const gridToLoad=Math\.min\(load,grid\);[\s\S]*const batteryToLoad=Math\.min\(remainingAfterGrid,discharge\);/);
assert.match(coverage,/const grid=Math\.max\(0,energy\.gridImport\);/);
assert.doesNotMatch(coverage,/const grid=.*energy\.gridToLoad/);
assert.match(costs,/const grid=Math\.max\(0,selectedEnergy\.gridImport\);/);
assert.doesNotMatch(costs,/const grid=.*selectedEnergy\.gridToLoad/);

console.log('✓ Red activa: cobertura y costos priorizan statusGrid=1.');
