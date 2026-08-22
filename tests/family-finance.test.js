import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dueToday } from '../server/familyFinance.js';
import { validateFinancialImage } from '../server/financialReceiptAi.js';

const image = { name: 'comprobante.jpg', dataUrl: 'data:image/jpeg;base64,YQ==' };
assert.equal(validateFinancialImage(image), image);
assert.throws(() => validateFinancialImage({ dataUrl: 'data:text/plain;base64,YQ==' }), /fotografía JPG/);

const weekly = { starts_on: '2026-08-01', frequency: 'weekly', pay_day: 5 };
assert.equal(dueToday(weekly, '2026-08-21'), true, 'viernes debe activar una mesada configurada para viernes');
assert.equal(dueToday(weekly, '2026-08-22'), false, 'sábado no debe activar una mesada configurada para viernes');
const monthly = { starts_on: '2026-08-01', frequency: 'monthly', pay_day: 21 };
assert.equal(dueToday(monthly, '2026-08-21'), true);
assert.equal(dueToday(monthly, '2026-08-20'), false);

const api = fs.readFileSync(new URL('../api/index.js', import.meta.url), 'utf8');
assert.match(api, /family\/receipts\/extract/);
assert.match(api, /requireAppPermission\(req, 'family\.approve'\)/);
assert.match(api, /readFinancialAttachment/);

const migration = fs.readFileSync(new URL('../supabase/migrations/20260822023000_family_finance_workflows.sql', import.meta.url), 'utf8');
assert.match(migration, /family-finance-documents/);
assert.match(migration, /status='pending'/);
assert.match(migration, /username='\[SENSITIVE\]'/);
const currentAccountMigration = fs.readFileSync(new URL('../supabase/migrations/20260822120000_unify_family_current_accounts.sql', import.meta.url), 'utf8');
assert.match(currentAccountMigration, /allowance_obligation_id/);
assert.match(currentAccountMigration, /allowance_charge/);
assert.match(currentAccountMigration, /on conflict\(allowance_obligation_id\)[\s\S]*where allowance_obligation_id is not null do nothing/);
assert.match(currentAccountMigration, /Cuenta corriente familiar/);
const allowanceSafetyMigration = fs.readFileSync(new URL('../supabase/migrations/20260822121000_pause_invalid_self_allowances.sql', import.meta.url), 'utf8');
assert.match(allowanceSafetyMigration, /beneficiary_user_id=responsible_user_id/);
assert.match(allowanceSafetyMigration, /status='paused'/);
const familyUi = fs.readFileSync(new URL('../src/components/FamilyFinancePage.tsx', import.meta.url), 'utf8');
assert.match(familyUi, />Platas</);
assert.doesNotMatch(familyUi, />Rendiciones</);
assert.match(familyUi, /Los depósitos suman\. Las mesadas y los gastos restan\./);
console.log('family finance workflow tests: ok');
