import assert from 'node:assert/strict';
import { calculateUtilityReminderSchedule } from '../server/utilityBills.js';

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

console.log('utility reading reminder tests passed');
