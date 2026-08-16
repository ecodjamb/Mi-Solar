import assert from 'node:assert/strict';
import { forecastLockDue } from '../server/solarProjection.js';

assert.equal(forecastLockDue(new Date('2026-08-14T01:34:00Z')), false, '21:34 de Chile todavía permite ajustar');
assert.equal(forecastLockDue(new Date('2026-08-14T01:35:00Z')), true, '21:35 de Chile fija la proyección');
assert.equal(forecastLockDue(new Date('2026-08-14T03:30:00Z')), true, 'La proyección permanece fija hasta medianoche');
assert.equal(forecastLockDue(new Date('2026-08-14T04:01:00Z')), false, 'Tras medianoche comienza la ventana del día siguiente');

console.log('solar projection lock tests: ok');
