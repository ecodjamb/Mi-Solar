import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tuyaRuleTest } from '../server/tuyaRules.js';

const input={deviceId:'device_1234',deviceName:'Calefactor',functionCode:'switch',startTime:'08:00',endTime:'20:00',days:[1,2,3,4,5,6,7]};
const normalized=tuyaRuleTest.normalize(input);
assert.equal(normalized.timezone,'America/Santiago');
assert.deepEqual(normalized.days,[1,2,3,4,5,6,7]);
assert.throws(()=>tuyaRuleTest.normalize({...input,deviceId:'x'}),/dispositivo/);
assert.throws(()=>tuyaRuleTest.normalize({...input,startTime:'25:00'}),/horas/);

const sundayMorning=new Date('2026-08-23T12:02:00.000Z');
assert.equal(tuyaRuleTest.due({id:9,start_time:'08:00',end_time:'20:00',days:[7]},'start',sundayMorning),'9:2026-08-23:start');
assert.equal(tuyaRuleTest.due({id:9,start_time:'08:00',end_time:'20:00',days:[1]},'start',sundayMorning),null);
const overnightEnd=new Date('2026-08-24T10:02:00.000Z');
assert.equal(tuyaRuleTest.due({id:10,start_time:'22:00',end_time:'06:00',days:[7]},'end',overnightEnd),'10:2026-08-24:end');

const migration=fs.readFileSync(new URL('../supabase/migrations/20260823144500_tuya_device_schedules.sql',import.meta.url),'utf8');
assert.match(migration,/unique/);
assert.match(migration,/run_key/);
assert.match(migration,/archived_at/);
const manifest=JSON.parse(fs.readFileSync(new URL('../pwa/manifest.webmanifest',import.meta.url),'utf8'));
assert.equal(manifest.shortcuts[0].url,'/?page=home&live=1');
const cronMigration=fs.readFileSync(new URL('../supabase/migrations/20260823161500_schedule_tuya_rules_with_pg_cron.sql',import.meta.url),'utf8');
assert.match(cronMigration,/misolar-tuya-rules-5m/);
assert.match(cronMigration,/vault\.decrypted_secrets/);
assert.doesNotMatch(cronMigration,/Bearer [A-Za-z0-9_-]{16,}/);
console.log('tuya schedule and PWA shortcut tests: ok');
