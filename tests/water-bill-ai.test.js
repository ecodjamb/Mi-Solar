import assert from 'node:assert/strict';
import { reconcileWaterBill } from '../server/waterBillAi.js';
import { calculateWaterProjection, classifyWaterConsumption, deleteWaterReading, normalizeWaterReadingM3 } from '../server/waterCosts.js';

const bill = reconcileWaterBill({
  periodStart: '2026-08-07', periodEnd: '2026-08-11', amountClp: 784570,
  subtotalServiceClp: 698599, otherChargesClp: 85801, discountsClp: 8,
  chargeItems: [{ label: 'CONVENIO PAGO SERVICIO (11/12)', amountClp: 85801, category: 'agreement' }],
  warnings: ['LECTURA ANTERIOR 07-ENE-2026 y LECTURA ACTUAL 11-AGO-2026.']
});

assert.equal(bill.periodStart, '2026-01-07');
assert.equal(bill.periodEnd, '2026-08-11');
assert.equal(bill.otherChargesClp, 85979);
assert.equal(bill.chargeItems[0].amountClp, 85979);
assert.equal(bill.readingStatus, 'estimated');

const verified = classifyWaterConsumption({
  periodStart: '2026-07-11', periodEnd: '2026-08-11', previousReadingM3: 7400,
  currentReadingM3: 7876, readingDifferenceM3: 476, deductibleM3: 19, billedM3: 457
});
assert.equal(verified.status, 'actual');
assert.equal(verified.method, 'actual-readings-verified');

const reconciled = classifyWaterConsumption({
  periodStart: '2026-01-07', periodEnd: '2026-08-11', previousReadingM3: 6797,
  currentReadingM3: 7876, readingDifferenceM3: 1079, deductibleM3: 622, billedM3: 457
});
assert.equal(reconciled.status, 'actual');

const estimated = classifyWaterConsumption({
  periodStart: '2026-07-11', periodEnd: '2026-08-11', billedM3: 42, readingStatus: 'actual'
});
assert.equal(estimated.status, 'estimated');

const aiMissingDates = classifyWaterConsumption({
  periodStart: '2026-07-11', periodEnd: '2026-08-11', previousReadingM3: 10, currentReadingM3: 20
}, { extracted: { periodStart: null, periodEnd: null, previousReadingM3: 10, currentReadingM3: 20 } });
assert.equal(aiMissingDates.status, 'estimated');

const missingReadings = reconcileWaterBill({
  periodStart: '2026-07-11', periodEnd: '2026-08-11', previousReadingM3: null,
  currentReadingM3: null, warnings: [], chargeItems: []
});
assert.equal(missingReadings.readingStatus, 'estimated');

const inferredReading = reconcileWaterBill({
  periodStart: '2026-05-11', periodEnd: '2026-06-10', previousReadingM3: 4280,
  currentReadingM3: 4382, readingDifferenceM3: 102, previousReadingVisible: false,
  currentReadingVisible: true, previousReadingDateVisible: true, currentReadingDateVisible: true,
  readingStatus: 'actual', consumptionIsEstimated: false,
  warnings: ['La lectura anterior no aparece visible; se infirió por resta.'], chargeItems: []
});
assert.equal(inferredReading.readingStatus, 'estimated');
assert.equal(inferredReading.previousReadingM3, null);
assert.equal(inferredReading.currentReadingM3, null);

const visiblePhotoReadings = classifyWaterConsumption({}, { extracted: {
  periodStart: '2026-07-07', periodEnd: '2026-08-11', previousReadingM3: 6797,
  currentReadingM3: 7876, readingDifferenceM3: 1079, deductibleM3: 622, billedM3: 457,
  previousReadingVisible: true, currentReadingVisible: true,
  previousReadingDateVisible: true, currentReadingDateVisible: true,
  readingStatus: 'actual', consumptionIsEstimated: false
} });
assert.equal(visiblePhotoReadings.status, 'actual');

const currentPeriodProjection = calculateWaterProjection({
  periodStart: '2026-08-11', expectedCloseDate: '2026-09-09', openingReadingM3: 7876
}, [{ readingAt: '2026-08-19T02:14:40.783Z', readingM3: 7892.713 }], [], new Date('2026-08-19T02:20:00.000Z'));
assert.equal(currentPeriodProjection.consumedM3, 16.713);
assert.equal(currentPeriodProjection.elapsedDays, 7);
assert.equal(currentPeriodProjection.averageDailyM3, 2.388);
assert.equal(currentPeriodProjection.projectedM3, 69.24);
assert.equal(currentPeriodProjection.projectedAmountClp, 103859);
assert.equal(normalizeWaterReadingM3('7893,125'), 7893.125);
assert.equal(normalizeWaterReadingM3(7893.1254), 7893.125);
assert.ok(Number.isNaN(normalizeWaterReadingM3('lectura')));
await assert.rejects(() => deleteWaterReading('96342509120972', 'no-valida'), /no es válida/);
console.log('water bill AI reconciliation tests: ok');
