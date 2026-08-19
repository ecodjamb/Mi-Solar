import assert from 'node:assert/strict';
import { reconcileWaterBill } from '../server/waterBillAi.js';

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
console.log('water bill AI reconciliation tests: ok');
