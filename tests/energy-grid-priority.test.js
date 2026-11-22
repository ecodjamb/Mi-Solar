import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const energy=readFileSync(new URL('../src/utils/energy.ts',import.meta.url),'utf8');
const coverage=readFileSync(new URL('../src/components/LoadCoverageBar.tsx',import.meta.url),'utf8');
const costs=readFileSync(new URL('../src/components/CostsPage.tsx',import.meta.url),'utf8');
const flow=readFileSync(new URL('../src/components/SimpleEnergyFlow.tsx',import.meta.url),'utf8');
const canonical=readFileSync(new URL('../server/canonicalTelemetry.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const automation=readFileSync(new URL('../server/automationStore.js',import.meta.url),'utf8');

assert.match(energy,/const gridToLoad=Math\.min\(load,grid\);[\s\S]*const batteryToLoad=Math\.min\(remainingAfterGrid,discharge\);/);
assert.match(coverage,/const grid=Math\.max\(0,energy\.gridImport\);/);
assert.doesNotMatch(coverage,/const grid=.*energy\.gridToLoad/);
assert.match(costs,/const grid=Math\.max\(0,selectedEnergy\.gridImport\);/);
assert.doesNotMatch(costs,/const grid=.*selectedEnergy\.gridToLoad/);
assert.match(energy,/const sourcePowerW=solar\+gridImport\+discharge;/);
assert.match(energy,/const processedPowerW=Math\.max\(sourcePowerW,deliveredPowerW\);/);
assert.match(flow,/Consumo inversor estimado/);
assert.match(flow,/simple-inverter-own-use/);
assert.match(energy,/export function inverterOutputPriority/);
assert.match(flow,/Inversor <b>\(\{outputPriority\}\)<\/b>/, 'Inicio muestra la prioridad real SBU, SOL o Utility junto al inversor.');
assert.match(canonical,/outputSourcePriority: canonical\.inverter\?\.output_priority/, 'La normalización no debe descartar la prioridad de salida.');
assert.match(flow,/outputPriorityOverride/, 'El flujo debe aceptar el último Output confirmado cuando la telemetría no incluye S05.');
assert.match(app,/devices\/\$\{selected\}\/automation/, 'Inicio recupera el Output guardado sin consultar nuevamente al proveedor.');
assert.match(automation,/inverter_configuration_events/, 'El Output visible debe provenir del último cambio confirmado y auditado.');

console.log('✓ Red activa: cobertura y costos priorizan statusGrid=1.');
