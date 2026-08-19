import assert from 'node:assert/strict';
import { reconcileWaterBill } from '../server/waterBillAi.js';
import { classifyWaterConsumption } from '../server/waterCosts.js';

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
console.log('water bill AI reconciliation tests: ok');
