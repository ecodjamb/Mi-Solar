import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeHistoryGaps, buildHistoryRepairWindows, historyLeaseRetryDelayMs, isolarProviderRangeForSantiagoDate, santiagoDateBoundsUtc, santiagoMidnightUtc } from '../server/providerStore.js';
import { ISolarProvider } from '../server/providers/isolarProvider.js';

const from = '2026-09-02T00:00:00.000Z';
const to = '2026-09-02T00:20:00.000Z';
const audit = analyzeHistoryGaps([
  { sample_at: '2026-09-02T00:00:00.000Z' },
  { sample_at: '2026-09-02T00:05:00.000Z' },
  { sample_at: '2026-09-02T00:15:00.000Z' }
], { from, to, bucketMinutes: 5 });
assert.equal(audit.expectedBuckets, 4);
assert.equal(audit.presentBuckets, 3);
assert.equal(audit.missingCount, 1);
assert.equal(new Date(audit.missingBuckets[0]).toISOString(), '2026-09-02T00:10:00.000Z');
assert.deepEqual(audit.gaps, [{ from: '2026-09-02T00:10:00.000Z', to: '2026-09-02T00:15:00.000Z', minutes: 5 }]);
assert.equal(santiagoMidnightUtc('2026-09-02T15:00:00.000Z').toISOString(), '2026-09-02T04:00:00.000Z');
assert.equal(santiagoMidnightUtc('2026-01-02T15:00:00.000Z').toISOString(), '2026-01-02T03:00:00.000Z');
assert.deepEqual(Object.fromEntries(Object.entries(santiagoDateBoundsUtc('2026-11-04')).map(([key,value])=>[key,value instanceof Date?value.toISOString():value])), {
  date: '2026-11-04', start: '2026-11-04T03:00:00.000Z', end: '2026-11-05T03:00:00.000Z'
});
assert.deepEqual(isolarProviderRangeForSantiagoDate('2026-11-04').providerRange, {
  start: '2026-11-04 11:00:00',
  end: '2026-11-05 10:59:59'
});

const repairWindows = buildHistoryRepairWindows([
  Date.parse('2026-09-01T04:00:00.000Z'),
  Date.parse('2026-09-01T04:05:00.000Z'),
  Date.parse('2026-09-02T10:00:00.000Z'),
  Date.parse('2026-09-02T16:00:00.000Z')
], { bucketMinutes: 5, chunkHours: 6, maxWindows: 2 });
assert.equal(repairWindows.length, 2);
assert.deepEqual(repairWindows.map(window => new Date(window.startMs).toISOString()), [
  '2026-09-02T12:00:00.000Z',
  '2026-09-02T06:00:00.000Z'
]);
assert.equal(historyLeaseRetryDelayMs({ last_attempt_at: '2026-09-02T17:32:00.000Z' }, Date.parse('2026-09-02T17:32:08.000Z')), 23_000);
assert.equal(historyLeaseRetryDelayMs({ last_attempt_at: '2026-09-02T17:31:00.000Z' }, Date.parse('2026-09-02T17:32:08.000Z')), 1_000);

const calls = [];
const provider = new ISolarProvider({ request: async (path, options) => {
  calls.push({ path, options });
  return {
    payload: { data: { list: [{ currentTime: `2026-09-02 08:${calls.length === 1 ? '00' : '05'}:00` }], total: 2, hasNextPage: calls.length === 1 } },
    token: `rotated-${calls.length}`
  };
} });
const session = { token: 'initial', vrtKey: 'key' };
const history = await provider.getHistory(session, { deviceSn: '12345678901234' }, {
  startDate: '2026-09-02 08:00:00', endDate: '2026-09-04 07:59:59', pageSize: 500, maxPages: 8
});
assert.equal(history.rows.length, 2);
assert.equal(history.requests, 2);
assert.equal(calls.length, 2);
assert.ok(calls.every((call) => call.path === 'workInfo/getHistoricalData'));
assert.equal(calls[0].options.params.pageSize, '500');
assert.equal(calls[1].options.token, 'rotated-1');
assert.equal(session.token, 'rotated-2');

const forceCalls=[];
const forceProvider=new ISolarProvider({request:async(path,options)=>{forceCalls.push({path,options});return{payload:{code:0,data:null},token:'force-token'}}});
const forceSession={token:'initial',vrtKey:'key'};
const forced=await forceProvider.forceTransmit(forceSession,{deviceSn:'12345678901234'});
assert.equal(forced.accepted,true);
assert.equal(forceCalls[0].path,'paramSet/setParam');
assert.equal(forceCalls[0].options.params.commands,JSON.stringify({FORCE_TRAN:'0'}));
assert.equal(forceSession.token,'force-token');

const technicalCalls=[];
const technicalProvider=new ISolarProvider({request:async(path)=>{
  technicalCalls.push(path);
  if(path==='rate/getRate')return{payload:{data:{mainVersion:'69.02',remoteVersion:'02.33',wifiVersion:'FC41_R11',outputPowerW:'12000',outputPowerVa:'12000',mpptTrack:'2'}},token:'rated-token'};
  if(path==='paramSet/getParam')return{payload:{data:{MN:'VII PREMIUM PLUS Series',PO:'2 0,1,2',BCRD:'15 10~100',MCC:'200 10~200'}},token:'settings-token'};
  throw new Error(`Unexpected endpoint ${path}`);
}});
const technicalSession={token:'initial',vrtKey:'key'};
const technical=await technicalProvider.getTechnicalProfile(technicalSession,{deviceSn:'12345678901234'});
assert.deepEqual(technicalCalls,['rate/getRate','paramSet/getParam']);
assert.equal(technical.summary.deviceModel,'VII PREMIUM PLUS Series');
assert.equal(technical.summary.mainCpuFirmware,'69.02');
assert.equal(technical.summary.secondaryCpuFirmware,'02.33');
assert.equal(technical.summary.loggerFirmware,'FC41_R11');
assert.equal(technical.summary.outputSourcePriority,'SBU');
assert.equal(technical.summary.ratedOutputPowerW,12000);
assert.equal(technical.summary.mpptTrackerCount,2);
assert.equal(technicalSession.token,'settings-token');

const store = readFileSync(new URL('../server/providerStore.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api/index.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.match(store, /const initial = await auditISolarHistoryToday\(siteId\)/);
assert.match(store, /if \(!initial\.missingCount\)/);
assert.match(store, /privateProviderSyncLease/);
assert.match(store, /HISTORY_LOOKBACK_DAYS = 3/);
assert.match(store, /minimumSeconds: 30/);
assert.match(store, /getHistory\(session, input/);
assert.match(store, /recent-first-6h-windows/);
assert.match(store, /maxPages: 1/);
assert.match(store, /queued behind realtime sync/);
assert.match(store, /await new Promise\(\(resolve\) => setTimeout\(resolve, retryDelayMs\)\)/);
assert.match(store, /source: 'isolar-history-repair'/);
assert.match(store, /source: 'isolar-realtime'/);
assert.match(store, /forceISolarRealtimeNow/);
assert.match(store, /downloadISolarDayArchive/);
assert.match(store, /formatISolarTimestamp\(bounds\.start\)/);
assert.match(store, /ARCHIVE_STORAGE_ERROR/);
const archive=readFileSync(new URL('../server/archive.js', import.meta.url), 'utf8');
assert.match(archive, /const batchSize=100/);
assert.match(archive, /new Map\(normalized\.map\(record=>\[\x60\$\{record\.site_id\}:\$\{record\.sample_at\}\x60,record\]\)\)/);
assert.match(api, /history-repair/);
assert.match(api, /force-transmit/);
assert.match(api, /providers\/isolar\/history-day/);
assert.match(api, /isolarHistoryRepair[\s\S]*requireAppViewIfEnabled/);
assert.match(client, /apiSingle/);
assert.match(app, /repairTodaySilently/);
assert.match(app, /últimas 72 horas/);
assert.doesNotMatch(app, /revisión diferida/);
assert.doesNotMatch(app, /Comprobar y completar/);
assert.match(app, /Completar día/);

const dailyMigration=readFileSync(new URL('../supabase/migrations/20261104235500_schedule_isolar_daily_history.sql',import.meta.url),'utf8');
assert.match(dailyMigration,/misolar-isolar-daily-history/);
assert.match(dailyMigration,/20 4 \* \* \*/);
assert.match(dailyMigration,/vault\.decrypted_secrets/);
assert.doesNotMatch(dailyMigration,/Bearer [A-Za-z0-9_-]{16,}/);

console.log('history repair tests passed');
