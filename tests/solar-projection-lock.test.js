import assert from 'node:assert/strict';
import { forecastAttainmentCorrection, forecastLockDue } from '../server/solarProjection.js';

assert.equal(forecastLockDue(new Date('2026-08-14T01:34:00Z')), false, '21:34 de Chile todavía permite ajustar');
assert.equal(forecastLockDue(new Date('2026-08-14T01:35:00Z')), true, '21:35 de Chile fija la proyección');
assert.equal(forecastLockDue(new Date('2026-08-14T03:30:00Z')), true, 'La proyección permanece fija hasta medianoche');
assert.equal(forecastLockDue(new Date('2026-08-14T04:01:00Z')), false, 'Tras medianoche comienza la ventana del día siguiente');
assert.deepEqual(forecastAttainmentCorrection([{ date: '2026-08-01', actualKwh: 5, forecastKwh: 10, coverageHours: 24 }]), { factor: 1, sampleDays: 1 }, 'no corrige con evidencia insuficiente');
assert.deepEqual(forecastAttainmentCorrection([
  { date: '2026-08-01', actualKwh: 8, forecastKwh: 10, coverageHours: 24 },
  { date: '2026-08-02', actualKwh: 9, forecastKwh: 10, coverageHours: 24 },
  { date: '2026-08-03', actualKwh: 7, forecastKwh: 10, coverageHours: 24 },
  { date: '2026-08-04', actualKwh: 8, forecastKwh: 10, coverageHours: 24 },
  { date: '2026-08-05', actualKwh: 6, forecastKwh: 10, coverageHours: 24 },
  { date: '2026-08-06', actualKwh: 0.1, forecastKwh: 10, coverageHours: 8 }
]), { factor: 0.8, sampleDays: 5 }, 'usa la mediana y descarta días incompletos');

console.log('solar projection lock tests: ok');
