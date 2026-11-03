import assert from 'node:assert/strict';
import {readArchiveSeries} from '../server/archive.js';
const originalFetch=global.fetch;
const previous={...process.env};
process.env.SUPABASE_URL='https://database.invalid';
process.env.SUPABASE_PUBLISHABLE_KEY='test-publishable';
process.env.MISOLAR_DB_KEY='test-backend';
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const requests=[];
global.fetch=async(url,options)=>{
 requests.push({url,options});
 return new Response(JSON.stringify(url.includes('/solar_sites?')?[{id:2}]:[{
   bucket_at:'2026-11-02T03:00:00Z',solar_w:2000,pv1_w:1200,pv2_w:800,load_w:900,
   grid_w:0,grid_active:false,battery_charge_w:400,battery_discharge_w:0,battery_soc:75,samples:4,coverage_hours:0.75
 }]),{status:200});
};
try{
 for(const resolution of ['hour','day']){
  const result=await readArchiveSeries('site:2','2026-11-02T03:00:00Z','2026-11-03T03:00:00Z',resolution);
  assert.equal(result.rows[0].aggregateHours,0.75,'retain actual coverage, not a whole hour/day');
  assert.equal(result.rows[0].pvInputPower1,1200);
  assert.equal(result.rows[0].pvInputPower2,800);
  assert.equal(result.rows[0].statusGrid,0);
  const request=requests.at(-1);
  assert.match(request.url,/rpc\/misolar_energy_series_backend$/);
  assert.equal(JSON.parse(request.options.body).p_resolution,resolution);
  assert.equal(JSON.parse(request.options.body).p_site_id,2);
 }
 assert.ok(!requests.some(x=>/\/energy_(daily|hourly)\?/.test(x.url)),'never recompute raw views per browser request');
}finally{
 global.fetch=originalFetch;
 for(const key of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','MISOLAR_DB_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY']){
  if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
 }
}
console.log('energy rollup API mapping, coverage and hourly/daily queries passed');
