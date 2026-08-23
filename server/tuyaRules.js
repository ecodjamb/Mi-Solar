import { privateRpc } from './privateRpc.js';
import { sendTuyaCommand } from './tuya.js';

const rulesDb=(operation,payload={})=>privateRpc('tuya_rules',operation,payload);
const dayIndex={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7};

function validTime(value){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));}
function normalize(input){
  const deviceId=String(input.deviceId||'').trim(),deviceName=String(input.deviceName||'Dispositivo Tuya').trim(),functionCode=String(input.functionCode||'').trim();
  if(!/^[A-Za-z0-9_-]{4,64}$/.test(deviceId)||!functionCode){const error=new Error('Selecciona un dispositivo y una función controlable.');error.status=400;throw error;}
  if(!validTime(input.startTime)||!validTime(input.endTime)){const error=new Error('Las horas de inicio y término no son válidas.');error.status=400;throw error;}
  const days=[...new Set((Array.isArray(input.days)?input.days:[]).map(Number).filter(value=>value>=1&&value<=7))].sort();
  if(!days.length){const error=new Error('Selecciona al menos un día de la semana.');error.status=400;throw error;}
  return{device_id:deviceId,device_name:deviceName.slice(0,160),function_code:functionCode,start_time:String(input.startTime),end_time:String(input.endTime),days,enabled:input.enabled!==false,timezone:'America/Santiago',conditions:input.conditions&&typeof input.conditions==='object'?input.conditions:{}};
}

export async function listTuyaRules(){return await rulesDb('list')||[];}
export async function createTuyaRule(session,input){return await rulesDb('create',{...normalize(input),created_by:session.user.id});}
export async function updateTuyaRule(session,id,input){return await rulesDb('update',{rule_id:Number(id),...normalize(input),updated_by:session.user.id});}
export async function archiveTuyaRule(session,id){return await rulesDb('archive',{rule_id:Number(id),updated_by:session.user.id});}

function chileParts(now){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(now).filter(item=>item.type!=='literal').map(item=>[item.type,item.value]));
  return{date:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour),minute:Number(parts.minute),weekday:dayIndex[parts.weekday]||1};
}
function previousWeekday(day){return day===1?7:day-1;}
function due(rule,kind,now){
  const current=chileParts(now),target=String(kind==='start'?rule.start_time:rule.end_time).slice(0,5),[hour,minute]=target.split(':').map(Number),nowMinute=current.hour*60+current.minute,targetMinute=hour*60+minute;
  if(nowMinute<targetMinute||nowMinute>=targetMinute+5)return null;
  const overnight=String(rule.end_time).slice(0,5)<=String(rule.start_time).slice(0,5),scheduledWeekday=kind==='end'&&overnight?previousWeekday(current.weekday):current.weekday;
  if(!(rule.days||[]).map(Number).includes(scheduledWeekday))return null;
  return`${rule.id}:${current.date}:${kind}`;
}

export async function runDueTuyaRules(now=new Date()){
  const rules=await rulesDb('enabled')||[];let executed=0,failed=0;
  for(const rule of rules)for(const kind of ['start','end']){
    const runKey=due(rule,kind,now);if(!runKey)continue;
    const claim=await rulesDb('claim',{rule_id:rule.id,run_key:runKey,action:kind,scheduled_for:now.toISOString()});
    if(!claim?.inserted)continue;
    try{await sendTuyaCommand(rule.device_id,rule.function_code,kind==='start');await rulesDb('complete',{run_id:claim.id,success:true});executed+=1;}
    catch(error){await rulesDb('complete',{run_id:claim.id,success:false,error:String(error?.message||error).slice(0,300)});failed+=1;}
  }
  return{checked:rules.length,executed,failed,at:now.toISOString()};
}

export const tuyaRuleTest={normalize,due,chileParts};
