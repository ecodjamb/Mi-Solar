import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/components/SimpleEnergyFlow.tsx',import.meta.url),'utf8');

assert.match(source,/Math\.max\(0, Math\.min\(100,/,'El SOC debe limitarse entre 0 y 100%.');
assert.match(source,/offset=\{`\$\{level\}%`\}/,'El corte del gradiente debe depender del SOC real.');
assert.match(source,/fill=\{`url\(#\$\{gradientId\}\)`\}/,'El cuerpo visible de la batería debe usar el gradiente dinámico.');
assert.match(source,/data-soc=\{rounded\}/,'El SOC renderizado debe quedar disponible para verificación visual.');
assert.match(source,/Math\.abs\(differenceSocPoints\) <= 5/,'La conciliación debe aceptar un margen de cinco puntos de SOC.');
assert.match(source,/bank\.nominalKwh \* endSoc \/ 100/,'La energía almacenada debe calcularse desde el SOC y la capacidad nominal del banco.');
assert.match(source,/today\.charge - today\.discharge/,'La variación diaria debe descontar la energía entregada de la cargada.');
assert.match(source,/Coincide con el SOC/,'La tarjeta debe mostrar el estado correcto con punto verde.');
assert.match(source,/Diferencia por revisar/,'La tarjeta debe advertir en amarillo una diferencia superior al margen.');

console.log('battery-soc-icon.test.js OK');
