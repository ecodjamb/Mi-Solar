import assert from 'node:assert/strict';
import {readPollPolicy,providerClaimSeconds} from '../server/pollPolicy.js';
const original=global.fetch;
const keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_PUBLISHABLE_KEY','MISOLAR_DB_KEY'];
const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
process.env.SUPABASE_URL='https://database.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='test';process.env.MISOLAR_DB_KEY='test';delete process.env.SUPABASE_SECRET_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
try{
 for(const visible of [false,true]){
  global.fetch=async(url,options)=>{
   assert.match(url,/misolar_poll_policy_backend$/);
   assert.equal(JSON.parse(options.body).p_monitor,true);
   return new Response(JSON.stringify({visible,minimumSeconds:visible?300:900,runMonitor:visible}));
  };
  const policy=await readPollPolicy({monitor:true});
  assert.equal(policy.minimumSeconds,visible?300:900);
  assert.equal(policy.runMonitor,visible);
 }
 global.fetch=async()=>new Response('database unavailable',{status:503});
 assert.deepEqual(await readPollPolicy({monitor:true}),{visible:true,minimumSeconds:300,runMonitor:true},'database errors must preserve monitoring');
 global.fetch=async()=>new Response(JSON.stringify({minimumSeconds:86400,runMonitor:false}));
 assert.equal((await readPollPolicy()).runMonitor,true,'reject malformed policy instead of silencing alerts');
}finally{
 global.fetch=original;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]}
}
console.log('visible/background polling and monitoring fallback passed');

assert.equal(providerClaimSeconds(300),270);
assert.equal(providerClaimSeconds(900),870);
assert.equal(providerClaimSeconds(10),30);
