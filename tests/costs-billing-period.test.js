import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/CostsPage.tsx', import.meta.url), 'utf8');

assert.match(source, /day\.gridImport/, 'El gráfico debe usar el acumulado de red validado por statusGrid=1.');
assert.match(source, /day\.solar/, 'El gráfico debe incluir la producción solar total diaria.');
assert.match(source, /addDays\(latest\.periodEnd,1\)/, 'El período actual debe comenzar después del cierre de la última boleta.');
assert.match(source, /nextMonthSameDay\(currentStart\)/, 'El siguiente cierre debe conservar el ciclo comercial de Enel.');
assert.match(source, /Mes calendario actual/, 'Debe poder compararse con el mes calendario actual.');
assert.match(source, /Período Enel actual/, 'Debe existir la vista del período Enel actual.');
assert.match(source, /chartAverage\*30/, 'La proyección de 30 días debe usar el promedio diario.');
assert.match(source, /<EnelBillsSection deviceSn=\{deviceSn\} siteLabel=\{siteLabel\}\/\>/, 'El historial y carga de cuentas Enel deben conservarse intactos.');

console.log('cost billing-period chart tests: ok');
