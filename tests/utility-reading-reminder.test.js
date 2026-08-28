import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateUtilityMeterProjection, calculateUtilityReminderSchedule } from '../server/utilityBills.js';
import { reconcileUtilityBill } from '../server/utilityBillAi.js';

const enabled = { enabled: true, notifyDayBefore: true, notifySameDay: true, notificationTimeLocal: '09:00' };
const before = calculateUtilityReminderSchedule(enabled, '2026-08-23', new Date('2026-08-19T15:00:00Z'));
assert.equal(before.daysRemaining, 4);
assert.equal(before.isOverdue, false);
assert.deepEqual(before.nextNotification, { kind: 'day-before', date: '2026-08-22', label: 'Día anterior', timeLocal: '09:00' });

const reminderMorning = calculateUtilityReminderSchedule(enabled, '2026-08-23', new Date('2026-08-23T11:00:00Z'));
assert.equal(reminderMorning.daysRemaining, 0);
assert.equal(reminderMorning.nextNotification?.kind, 'same-day');

const disabled = calculateUtilityReminderSchedule({ ...enabled, enabled: false }, '2026-08-23', new Date('2026-08-19T15:00:00Z'));
assert.equal(disabled.nextNotification, null);

const overdue = calculateUtilityReminderSchedule(enabled, '2026-08-23', new Date('2026-08-24T15:00:00Z'));
assert.equal(overdue.daysRemaining, 0);
assert.equal(overdue.isOverdue, true);

const extracted = reconcileUtilityBill({ previousReading: 43063, currentReading: 44846, billedKwh: null, consumptionIsEstimated: false, warnings: [] });
assert.equal(extracted.billedKwh, 1783);
assert.deepEqual(extracted.warnings, []);

const meterProjection = calculateUtilityMeterProjection({
  periodStart: '2026-07-23', periodEnd: '2026-08-23', openingReadingKwh: 44846,
  readings: [{ readingAt: '2026-08-19T15:00:00Z', readingKwh: 45656 }]
});
assert.equal(meterProjection.consumedKwh, 810);
assert.equal(meterProjection.elapsedDays, 27);
assert.equal(meterProjection.totalDays, 31);
assert.equal(meterProjection.projectedKwh, 930);

const migration = readFileSync(new URL('../supabase/migrations/20260825144959_utility_bill_projection_snapshots.sql', import.meta.url), 'utf8');
const interfaceSource = readFileSync(new URL('../src/components/EnelBillsSection.tsx', import.meta.url), 'utf8');
assert.match(migration, /utility_projection_snapshots/);
assert.match(migration, /misolar_projection jsonb/);
assert.match(migration, /meter_projection jsonb/);
assert.match(interfaceSource, /Comparativo congelado al ingresar la cuenta/);
assert.match(interfaceSource, /Proyección por lecturas/);
assert.match(interfaceSource, /Proyección Mi Solar · red Estado 1/);
assert.match(interfaceSource, /Ingresar lectura medidor/);
assert.doesNotMatch(interfaceSource, /Historial de lecturas \(\{meterTracking\.readings\.length\}\)<\/summary>/);

console.log('utility reading reminder tests passed');
