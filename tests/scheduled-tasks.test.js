import assert from 'node:assert/strict';
import handler from '../api/index.js';
const fetchBefore=global.fetch;
const envBefore={...process.env};
process.env.CRON_SECRET='test-cron';process.env.SUPABASE_URL='https://database.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='test';process.env.MISOLAR_DB_KEY='test';
delete process.env.SUPABASE_SECRET_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let paths=[];
global.fetch=async url=>{paths.push(String(url));return new Response('[]',{status:200})};
async function run(route,authorized){
 let body;const res={setHeader(){},end(value){body=JSON.parse(value)}};
 await handler({method:'POST',query:{path:route},headers:authorized?{authorization:'Bearer test-cron'}:{}},res);
 return {status:res.statusCode,body};
}
try{
 for(const route of ['forecast/run','notifications/reminders','automation/run']){
  const result=await run(route,false);assert.equal(result.status,401);assert.equal(paths.length,0);
 }
 let result=await run('automation/run',true);
 assert.equal(result.status,200);assert.equal(result.body.automation.rules,0);
 assert.ok(paths.every(x=>x.includes('automation_rules?')),'disabled rules do not query forecasts, weather or inverters');
 paths=[];result=await run('forecast/run',true);assert.equal(result.status,200);
 assert.ok(paths.some(x=>x.includes('solar_sites?')));assert.ok(!paths.some(x=>x.includes('automation_rules?')));
 paths=[];result=await run('notifications/reminders',true);assert.equal(result.status,200);
 assert.ok(!paths.some(x=>x.includes('automation_rules?')||x.includes('tumcapp')),'morning reminders do not poll inverters');
 assert.ok('waterReminders' in result.body&&'utilityBillReminders' in result.body);
}finally{
 global.fetch=fetchBefore;for(const key of ['CRON_SECRET','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','MISOLAR_DB_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY']){if(envBefore[key]===undefined)delete process.env[key];else process.env[key]=envBefore[key]}
}
console.log('separate scheduled routes, authentication and disabled-rule isolation passed');
