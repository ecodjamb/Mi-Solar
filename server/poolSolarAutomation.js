import crypto from 'node:crypto';
import { privateRpc } from './privateRpc.js';
import { latestCanonical, syncProviderRealtimeIfDue } from './providerStore.js';
import { getTuyaDeviceProfile, listTuyaDevices, readTuyaBooleanState, sendTuyaBooleanCommandConfirmed } from './tuya.js';
import { sendSiteNotification } from './pushNotifications.js';
import { automationSiteProfile } from './siteProfiles.js';
import { resolveDeviceReference } from './archive.js';

export const POOL_PUSH_DEFAULTS={circuit_started:true,a1_on:true,a2_on:true,a2_off:true,a1_off:true,errors:true,sunset_shutdown_enabled:false};
export const POOL_DEFAULTS={enabled:false,control_mode:'off',water_control_mode:'off',telemetry_provider:'isolar',grid_zero_w:100,condition_a_charge_w:3000,condition_a_soc:60,condition_a_confirm_seconds:480,condition_b_charge_w:4000,condition_b_soc:65,condition_b_confirm_seconds:180,stop_soc:75,discharge_stop_w:1000,discharge_confirm_seconds:180,a1_to_a2_delay_seconds:30,a2_to_a1_delay_seconds:30,a2_min_run_seconds:900,a2_cooldown_seconds:300,manual_override_seconds:1800,telemetry_max_age_seconds:420,sunset_shutdown_offset_minutes:120,push_preferences:POOL_PUSH_DEFAULTS};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const iso=value=>value?new Date(value).toISOString():null;
const elapsed=(from,now)=>from?(now-new Date(from).getTime())/1000:0;
const POOL_TIME_ZONE='America/Santiago';

function normalizeDegrees(value){return ((value%360)+360)%360}
function chileDate(now){return new Intl.DateTimeFormat('en-CA',{timeZone:POOL_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
function dayOfYear(date){const [year,month,day]=date.split('-').map(Number);return Math.floor((Date.UTC(year,month-1,day)-Date.UTC(year,0,0))/86400000)}
export function sunsetAtCoordinates(localDate,latitude,longitude){
  const [year,month,day]=localDate.split('-').map(Number),n=dayOfYear(localDate),lngHour=longitude/15,t=n+(18-lngHour)/24;
  const mean=(0.9856*t)-3.289;
  const longitudeSun=normalizeDegrees(mean+1.916*Math.sin(mean*Math.PI/180)+0.020*Math.sin(2*mean*Math.PI/180)+282.634);
  let ascension=normalizeDegrees(Math.atan(0.91764*Math.tan(longitudeSun*Math.PI/180))*180/Math.PI);
  ascension+=(Math.floor(longitudeSun/90)*90)-(Math.floor(ascension/90)*90);ascension/=15;
  const sinDeclination=0.39782*Math.sin(longitudeSun*Math.PI/180),cosDeclination=Math.cos(Math.asin(sinDeclination));
  const cosHour=(Math.cos(90.833*Math.PI/180)-sinDeclination*Math.sin(latitude*Math.PI/180))/(cosDeclination*Math.cos(latitude*Math.PI/180));
  if(cosHour<-1||cosHour>1)return null;
  const hour=Math.acos(cosHour)*180/Math.PI/15;
  const utcHour=((hour+ascension-(0.06571*t)-6.622-lngHour)%24+24)%24;
  return new Date(Date.UTC(year,month-1,day)+utcHour*3600000);
}
export function poolSunsetSafety(config,nowValue=Date.now()){
  const now=new Date(nowValue),localDate=chileDate(now),profile=automationSiteProfile(config.site_device_sn||'96342509120972');
  const enabled=({...POOL_PUSH_DEFAULTS,...(config.push_preferences||{})}).sunset_shutdown_enabled===true;
  const configuredOffset=config.sunset_shutdown_offset_minutes??config.push_preferences?.sunset_shutdown_offset_minutes;
  const sunset=sunsetAtCoordinates(localDate,profile.latitude,profile.longitude),offsetMinutes=Math.max(0,Number(configuredOffset??120));
  const cutoff=sunset?new Date(sunset.getTime()-offsetMinutes*60000):null;
  return {enabled,active:Boolean(enabled&&cutoff&&now.getTime()>=cutoff.getTime()),local_date:localDate,sunset_at:iso(sunset),cutoff_at:iso(cutoff),offset_minutes:offsetMinutes};
}

export function poolTelemetryFrom(sample,now,maximumAge){
  const c=sample?.canonical||{},sampled=c.time?.sampled_at_utc||sample?.sampled_at||null,age=sampled?Math.max(0,(now-new Date(sampled).getTime())/1000):Infinity;
  // La misma regla canónica que usa Inicio: cuando el inversor informa que la
  // red está desconectada, cualquier potencia residual del campo crudo no es
  // importación real y debe ser 0 W también para la automatización.
  const gridActive=c.grid?.active;
  const grid=gridActive===false?0:Number(c.grid?.power),battery=Number(c.battery?.power),soc=Number(c.battery?.soc),solar=Number(c.pv?.total_power);
  const complete=[grid,battery,soc,solar].every(Number.isFinite);
  return {valid:complete&&age<=maximumAge,sampled_at:sampled,age_seconds:Math.round(age),grid_active:gridActive===true,grid_power_w:complete?Math.max(0,grid):null,battery_power_w:complete?battery:null,battery_charge_w:complete?Math.max(0,-battery):null,battery_discharge_w:complete?Math.max(0,battery):null,battery_direction:complete?(battery<0?'charging':battery>0?'discharging':'neutral'):null,soc:complete?soc:null,solar_power_w:complete?Math.max(0,solar):null};
}

export function poolControlMode(config,state=null){
  if(['manual','off','automatic'].includes(config?.control_mode))return config.control_mode;
  if(state?.runtime?.manual_hold_active===true)return 'manual';
  return config?.enabled?'automatic':'off';
}
export function poolWaterControlMode(config){return ['manual','off','automatic'].includes(config?.water_control_mode)?config.water_control_mode:'off'}
export function poolActiveAutomation(config,state=null){
  if(poolWaterControlMode(config)!=='off')return 'water';
  if(poolControlMode(config,state)!=='off')return 'heat';
  return null;
}

export function evaluatePoolState(config,state,telemetry,deviceState,now=Date.now(),sunsetSafety=null){
  const runtime={...(state?.runtime||{})},result={phase:state?.phase||'waiting_surplus',runtime,action:null,reason:null};
  const controlMode=poolControlMode(config,state);runtime.control_mode=controlMode;
  if(sunsetSafety?.sunset_at){runtime.sunset_at=sunsetSafety.sunset_at;runtime.sunset_cutoff_at=sunsetSafety.cutoff_at;runtime.sunset_offset_minutes=sunsetSafety.offset_minutes}
  if(controlMode==='off'){
    runtime.condition_a_since=null;runtime.condition_b_since=null;runtime.discharge_since=null;runtime.last_blockers=['Modo apagado: Mi Solar no interviene en A1 ni A2'];
    return {...result,phase:'disabled',reason:'Control de automatización en punto neutro'};
  }
  // La protección de circulación siempre prevalece: A2 nunca puede quedar
  // encendida si A1 no está confirmada. Fuera de esa excepción, el modo de
  // prueba manual mantiene ambos contactores encendidos hasta que el usuario
  // apaga explícitamente el switch de la interfaz.
  if(deviceState.a2_on&&!deviceState.a1_on)return {...result,phase:'error_a1',action:'a2_off',reason:'Protección: A2 estaba activo sin circulación A1'};
  if(controlMode==='manual'){
    runtime.manual_hold_active=true;runtime.manual_cycle_active=true;runtime.manual_override_until=null;runtime.last_blockers=['Modo manual: la secuencia queda bajo control directo del usuario'];
    return {...result,phase:'manual_override',reason:'Control manual persistente activo'};
  }
  const manualHold=runtime.manual_hold_active===true;
  if(manualHold&&!deviceState.a1_on&&!deviceState.a2_on){
    // Si Tuya confirma ambos contactores apagados, una marca antigua jamás
    // puede mantener la interfaz en Manual ON. Se limpia en el siguiente
    // ciclo y el estado vuelve a depender de la automatización configurada.
    runtime.manual_hold_active=false;runtime.manual_cycle_active=false;runtime.manual_override_until=null;
  }else if(manualHold){runtime.manual_cycle_active=true;runtime.last_blockers=['Circuito mantenido encendido por el switch manual'];return {...result,phase:'manual_override',reason:'Control manual persistente activo'};}
  if(sunsetSafety?.active){
    runtime.sunset_shutdown_date=sunsetSafety.local_date;runtime.condition_a_since=null;runtime.condition_b_since=null;runtime.last_blockers=[`Corte de respaldo activo ${sunsetSafety.offset_minutes} min antes de la puesta de sol`];
    if(deviceState.a1_on||deviceState.a2_on)return {...result,phase:'sunset_shutdown',action:'sunset_shutdown',reason:`Corte de respaldo: ${sunsetSafety.offset_minutes} min antes de la puesta de sol`};
    return {...result,phase:'sunset_shutdown'};
  }
  if(!telemetry.valid){runtime.last_blockers=[`Telemetría atrasada (${telemetry.age_seconds??'—'} s; máximo ${config.telemetry_max_age_seconds} s)`];return {...result,phase:'error_telemetry',reason:'Datos solares ausentes o atrasados'};}
  if(deviceState.a2_on){
    const high=telemetry.battery_direction==='discharging'&&telemetry.battery_discharge_w>=config.discharge_stop_w;
    runtime.discharge_since=high?(runtime.discharge_since||new Date(now).toISOString()):null;
    if(high&&elapsed(runtime.discharge_since,now)>=config.discharge_confirm_seconds)return {...result,phase:'validating_shutdown',action:'a2_off',reason:`Apagado descarga >= ${config.discharge_stop_w} W`};
    const minimumDone=elapsed(runtime.a2_started_at,now)>=config.a2_min_run_seconds;
    if(minimumDone&&telemetry.battery_direction==='discharging'&&telemetry.soc<=config.stop_soc)return {...result,phase:'validating_shutdown',action:'a2_off',reason:`Apagado SOC <= ${config.stop_soc}%`};
    return {...result,phase:minimumDone?'active':'minimum_runtime'};
  }
  if(!config.enabled)return {...result,phase:'disabled'};
  if(runtime.manual_override_until&&new Date(runtime.manual_override_until).getTime()>now)return {...result,phase:'manual_override'};
  if(runtime.cooldown_until&&new Date(runtime.cooldown_until).getTime()>now)return {...result,phase:'cooldown'};
  const condA=telemetry.grid_power_w<=config.grid_zero_w&&telemetry.battery_direction==='charging'&&telemetry.battery_charge_w>=config.condition_a_charge_w&&telemetry.soc>=config.condition_a_soc;
  const condB=telemetry.grid_power_w<=config.grid_zero_w&&telemetry.battery_direction==='charging'&&telemetry.battery_charge_w>=config.condition_b_charge_w&&telemetry.soc>=config.condition_b_soc;
  runtime.last_blockers=condA||condB?[]:[
    telemetry.grid_power_w>config.grid_zero_w?`Red ${Math.round(telemetry.grid_power_w)} W > ${config.grid_zero_w} W`:null,
    telemetry.battery_direction!=='charging'?`Batería ${telemetry.battery_direction||'sin estado'}`:null,
    telemetry.battery_charge_w<config.condition_a_charge_w?`Carga batería ${Math.round(telemetry.battery_charge_w)} W < ${config.condition_a_charge_w} W`:null,
    telemetry.soc<config.condition_a_soc?`SOC ${Math.round(telemetry.soc)}% < ${config.condition_a_soc}%`:null
  ].filter(Boolean);
  runtime.condition_a_since=condA?(runtime.condition_a_since||new Date(now).toISOString()):null;
  runtime.condition_b_since=condB?(runtime.condition_b_since||new Date(now).toISOString()):null;
  const readyB=condB&&elapsed(runtime.condition_b_since,now)>=config.condition_b_confirm_seconds;
  const readyA=condA&&elapsed(runtime.condition_a_since,now)>=config.condition_a_confirm_seconds;
  if(readyA||readyB)return {...result,phase:deviceState.a1_on?'starting_a2':'starting_a1',action:deviceState.a1_on?'a2_on':'a1_then_a2',reason:readyB?'Encendido Condición B':'Encendido Condición A'};
  return {...result,phase:condA||condB?'validating_surplus':'waiting_surplus'};
}

export function evaluatePoolWaterState(config,state,telemetry,deviceState,now=Date.now(),sunsetSafety=null){
  const runtime={...(state?.runtime||{})},mode=poolWaterControlMode(config),result={phase:state?.phase||'waiting_surplus',runtime,action:null,reason:null};
  runtime.active_automation=mode==='off'?'off':'water';runtime.water_control_mode=mode;
  if(sunsetSafety?.sunset_at){runtime.sunset_at=sunsetSafety.sunset_at;runtime.sunset_cutoff_at=sunsetSafety.cutoff_at;runtime.sunset_offset_minutes=sunsetSafety.offset_minutes}
  if(mode==='off'){
    runtime.condition_a_since=null;runtime.condition_b_since=null;runtime.discharge_since=null;runtime.last_blockers=['Bomba de agua apagada: Mi Solar no interviene en A1'];
    return {...result,phase:'disabled',reason:'Control de bomba de agua en punto neutro'};
  }
  if(mode==='manual'){
    runtime.manual_hold_active=true;runtime.manual_cycle_active=true;runtime.last_blockers=['Bomba de agua bajo control manual'];
    return {...result,phase:'manual_override',reason:'Bomba de agua en modo manual persistente'};
  }
  if(sunsetSafety?.active){
    runtime.condition_a_since=null;runtime.condition_b_since=null;runtime.discharge_since=null;runtime.last_blockers=[`Corte de respaldo activo ${sunsetSafety.offset_minutes} min antes de la puesta de sol`];
    if(deviceState.a1_on&&runtime.a1_started_by_automation)return {...result,phase:'sunset_shutdown',action:'a1_off',reason:`Corte de respaldo: ${sunsetSafety.offset_minutes} min antes de la puesta de sol`};
    return {...result,phase:'sunset_shutdown'};
  }
  if(!telemetry.valid){runtime.last_blockers=[`Telemetría atrasada (${telemetry.age_seconds??'—'} s; máximo ${config.telemetry_max_age_seconds} s)`];return {...result,phase:'error_telemetry',reason:'Datos solares ausentes o atrasados'};}
  if(deviceState.a1_on){
    if(!runtime.a1_started_by_automation){runtime.last_blockers=['A1 ya estaba encendida fuera de esta automatización'];return {...result,phase:'manual_override',reason:'A1 encendida por horario u orden externa'};}
    const high=telemetry.battery_direction==='discharging'&&telemetry.battery_discharge_w>=config.discharge_stop_w;
    runtime.discharge_since=high?(runtime.discharge_since||new Date(now).toISOString()):null;
    if(high&&elapsed(runtime.discharge_since,now)>=config.discharge_confirm_seconds)return {...result,phase:'validating_shutdown',action:'a1_off',reason:`Apagado descarga >= ${config.discharge_stop_w} W`};
    const minimumDone=elapsed(runtime.a1_started_at||runtime.a2_started_at,now)>=config.a2_min_run_seconds;
    if(minimumDone&&telemetry.battery_direction==='discharging'&&telemetry.soc<=config.stop_soc)return {...result,phase:'validating_shutdown',action:'a1_off',reason:`Apagado SOC <= ${config.stop_soc}%`};
    return {...result,phase:minimumDone?'active':'minimum_runtime'};
  }
  if(runtime.manual_override_until&&new Date(runtime.manual_override_until).getTime()>now)return {...result,phase:'manual_override'};
  if(runtime.cooldown_until&&new Date(runtime.cooldown_until).getTime()>now)return {...result,phase:'cooldown'};
  const condA=telemetry.grid_power_w<=config.grid_zero_w&&telemetry.battery_direction==='charging'&&telemetry.battery_charge_w>=config.condition_a_charge_w&&telemetry.soc>=config.condition_a_soc;
  const condB=telemetry.grid_power_w<=config.grid_zero_w&&telemetry.battery_direction==='charging'&&telemetry.battery_charge_w>=config.condition_b_charge_w&&telemetry.soc>=config.condition_b_soc;
  runtime.last_blockers=condA||condB?[]:[telemetry.grid_power_w>config.grid_zero_w?`Red ${Math.round(telemetry.grid_power_w)} W > ${config.grid_zero_w} W`:null,telemetry.battery_direction!=='charging'?`Batería ${telemetry.battery_direction||'sin estado'}`:null,telemetry.battery_charge_w<config.condition_a_charge_w?`Carga batería ${Math.round(telemetry.battery_charge_w)} W < ${config.condition_a_charge_w} W`:null,telemetry.soc<config.condition_a_soc?`SOC ${Math.round(telemetry.soc)}% < ${config.condition_a_soc}%`:null].filter(Boolean);
  runtime.condition_a_since=condA?(runtime.condition_a_since||new Date(now).toISOString()):null;
  runtime.condition_b_since=condB?(runtime.condition_b_since||new Date(now).toISOString()):null;
  const readyB=condB&&elapsed(runtime.condition_b_since,now)>=config.condition_b_confirm_seconds,readyA=condA&&elapsed(runtime.condition_a_since,now)>=config.condition_a_confirm_seconds;
  if(readyA||readyB)return {...result,phase:'starting_a1',action:'a1_on',reason:readyB?'Encendido Condición B':'Encendido Condición A'};
  return {...result,phase:condA||condB?'validating_surplus':'waiting_surplus'};
}

async function db(operation,payload={}){return privateRpc('pool_automation',operation,payload)}
async function dbMode(operation,payload={}){return privateRpc('pool_mode',operation,payload)}
function boolFunction(profile){return profile.specification.functions.find(row=>row.type==='Boolean'&&['switch','switch_1','power'].includes(row.code))||profile.specification.functions.find(row=>row.type==='Boolean')}
async function resolveDevice(deviceId){if(!deviceId)return null;const profile=await getTuyaDeviceProfile(deviceId),fn=boolFunction(profile);if(!fn){const error=new Error('El dispositivo seleccionado no publica un interruptor ON/OFF compatible.');error.status=400;throw error}return {id:deviceId,name:profile.device.customName||profile.device.name||profile.device.device_name||'Dispositivo Tuya',code:fn.code}}
export async function getPoolSolarAutomation(siteId){
  const result=await db('get',{site_id:Number(siteId)})||{config:null,state:null,events:[]};
  if(result.config){
    const pushPreferences={...POOL_PUSH_DEFAULTS,...(result.config.push_preferences||{})};
    result.config={...result.config,control_mode:poolControlMode(result.config,result.state),water_control_mode:poolWaterControlMode(result.config),push_preferences:pushPreferences,sunset_shutdown_offset_minutes:Number(pushPreferences.sunset_shutdown_offset_minutes??120)};
  }
  return result;
}
export async function savePoolSolarAutomation(session,siteId,input){
  const existing=await getPoolSolarAutomation(siteId);
  if(existing?.state?.a2_on&&input.enabled&&((input.a1_device_id&&input.a1_device_id!==existing.config?.a1_device_id)||(input.a2_device_id&&input.a2_device_id!==existing.config?.a2_device_id))){const error=new Error('Apaga o desactiva el ciclo actual antes de cambiar los contactores A1/A2.');error.status=409;throw error}
  if(existing?.config?.enabled&&!input.enabled&&existing.state?.a2_on){
    await sendTuyaBooleanCommandConfirmed(existing.config.a2_device_id,existing.config.a2_function_code,false);
    if(existing.state?.runtime?.a1_started_by_automation&&existing.state?.a1_on){await sleep(Number(existing.config.a2_to_a1_delay_seconds||30)*1000);await sendTuyaBooleanCommandConfirmed(existing.config.a1_device_id,existing.config.a1_function_code,false)}
  }
  const a1=await resolveDevice(String(input.a1_device_id||'')),a2=await resolveDevice(String(input.a2_device_id||''));
  if(input.enabled&&(!a1||!a2)){const error=new Error('Selecciona A1 y A2 antes de activar la automatización.');error.status=400;throw error}
  if(a1&&a2&&a1.id===a2.id){const error=new Error('A1 y A2 deben ser dispositivos distintos.');error.status=400;throw error}
  const sunsetOffset=Number(input.sunset_shutdown_offset_minutes??120);
  const mode=poolControlMode(input,existing?.state),payload={...POOL_DEFAULTS,...input,control_mode:mode,enabled:mode==='automatic',push_preferences:{...POOL_PUSH_DEFAULTS,...(input.push_preferences||{}),sunset_shutdown_offset_minutes:sunsetOffset},site_id:Number(siteId),a1_device_id:a1?.id||null,a1_device_name:a1?.name||null,a1_function_code:a1?.code||null,a2_device_id:a2?.id||null,a2_device_name:a2?.name||null,a2_function_code:a2?.code||null,actor_user_id:session?.user?.id||null};
  for(const key of Object.keys(POOL_DEFAULTS).filter(key=>typeof POOL_DEFAULTS[key]==='number'))payload[key]=Number(payload[key]);
  return await db('save_config',payload);
}
async function event(config,action,reason,t,d,success=true,details={},initiatedBy='automation'){return db('event',{site_id:config.site_id,event_key:crypto.randomUUID(),occurred_at:new Date().toISOString(),action,reason,success,initiated_by:initiatedBy,soc:t?.soc,solar_power_w:t?.solar_power_w,battery_power_w:t?.battery_power_w,grid_power_w:t?.grid_power_w,a1_on:d?.a1_on,a2_on:d?.a2_on,details})}
async function notify(config,key,title,body,data={}){if(!({...POOL_PUSH_DEFAULTS,...config.push_preferences})[key])return null;return sendSiteNotification(config.site_id,`pool_${key}`,title,body,{url:'/?page=integrations',siteId:config.site_id,...data},`pool-${key}-${Date.now()}`)}
async function states(config){
  const [a1,a2]=await Promise.all([
    readTuyaBooleanState(config.a1_device_id,config.a1_function_code),
    config.a2_device_id?readTuyaBooleanState(config.a2_device_id,config.a2_function_code):Promise.resolve({on:false})
  ]);
  return {a1_on:a1.on,a2_on:a2.on};
}
async function runOne(config){
  const activeAutomation=poolActiveAutomation(config);if(!activeAutomation)return {siteId:config.site_id,skipped:'control_off'};
  const claimed=await db('claim',{site_id:config.site_id});if(!claimed)return {siteId:config.site_id,skipped:'locked'};
  let phase=claimed.phase||'waiting_surplus',runtime=claimed.runtime||{},telemetry={},d={a1_on:null,a2_on:null},errorCode=null,errorMessage=null;
  try{
    // Solicita una fotografía fresca mediante el mismo regulador global de la
    // app. Si Inicio o el cron ya iniciaron el ciclo de este minuto, reutiliza
    // la muestra respaldada sin abrir otra consulta al proveedor.
    let syncWarning=null;
    try{await syncProviderRealtimeIfDue({siteId:config.site_id,provider:config.telemetry_provider,minimumSeconds:60})}catch(error){syncWarning=String(error?.message||'No se pudo actualizar la telemetría').slice(0,240)}
    const [sample,deviceState,deviceSn]=await Promise.all([latestCanonical(config.site_id,config.telemetry_provider),states(config),resolveDeviceReference(`site:${config.site_id}`)]);d=deviceState;telemetry={...poolTelemetryFrom(sample,Date.now(),config.telemetry_max_age_seconds),sync_warning:syncWarning};
    config={...config,site_device_sn:deviceSn||config.site_device_sn};
    const sunsetSafety=poolSunsetSafety(config),decision=activeAutomation==='water'?evaluatePoolWaterState(config,{phase,runtime},telemetry,d,Date.now(),sunsetSafety):evaluatePoolState(config,{phase,runtime},telemetry,d,Date.now(),sunsetSafety);phase=decision.phase;runtime=decision.runtime;
    if(decision.action==='a1_on'){
      await notify(config,'circuit_started','☀️ Piscina: circulación solar iniciada',`${decision.reason}. Mi Solar operará solamente la bomba de agua.`).catch(()=>{});
      await sendTuyaBooleanCommandConfirmed(config.a1_device_id,config.a1_function_code,true);d.a1_on=true;runtime.a1_started_by_automation=true;runtime.a1_started_at=new Date().toISOString();phase='minimum_runtime';await event(config,'A1 ON',`${decision.reason} · Solo bomba de agua`,telemetry,d);
      await notify(config,'a1_on','💧 Bomba de agua encendida','A1 quedó confirmada ON por la automatización solar exclusiva.').catch(()=>{});
    }else if(decision.action==='a1_off'){
      if(d.a1_on){await sendTuyaBooleanCommandConfirmed(config.a1_device_id,config.a1_function_code,false);d.a1_on=false;await event(config,'A1 OFF',`${decision.reason} · Solo bomba de agua`,telemetry,d);await notify(config,'a1_off','💧 Bomba de agua apagada',decision.reason).catch(()=>{})}
      runtime={cooldown_until:new Date(Date.now()+config.a2_cooldown_seconds*1000).toISOString(),active_automation:'water',water_control_mode:poolWaterControlMode(config)};phase='cooldown';
    }else if(decision.action==='a1_then_a2'){
      await notify(config,'circuit_started','☀️ Piscina: ciclo solar iniciado',`${decision.reason}. Mi Solar iniciará primero la circulación.`).catch(()=>{});
      await sendTuyaBooleanCommandConfirmed(config.a1_device_id,config.a1_function_code,true);d.a1_on=true;runtime.a1_started_by_automation=true;phase='waiting_circulation';await event(config,'A1 ON',decision.reason,telemetry,d);
      await notify(config,'a1_on','💧 Bomba de agua encendida','A1 quedó confirmada ON; comienza el tiempo de circulación.').catch(()=>{});
      await sleep(config.a1_to_a2_delay_seconds*1000);await sendTuyaBooleanCommandConfirmed(config.a2_device_id,config.a2_function_code,true);d.a2_on=true;runtime.a2_started_at=new Date().toISOString();phase='minimum_runtime';await event(config,'A2 ON',decision.reason,telemetry,d);
      await notify(config,'a2_on','🔥 Bomba de calor encendida','A2 quedó confirmada ON usando el excedente solar.').catch(()=>{});
    }else if(decision.action==='a2_on'){
      await notify(config,'circuit_started','☀️ Piscina: ciclo solar iniciado',`${decision.reason}. A1 ya estaba encendida.`).catch(()=>{});runtime.a1_started_by_automation=false;await sendTuyaBooleanCommandConfirmed(config.a2_device_id,config.a2_function_code,true);d.a2_on=true;runtime.a2_started_at=new Date().toISOString();phase='minimum_runtime';await event(config,'A2 ON',decision.reason,telemetry,d);await notify(config,'a2_on','🔥 Bomba de calor encendida','A2 quedó confirmada ON usando el excedente solar.').catch(()=>{});
    }else if(decision.action==='a2_off'){
      await sendTuyaBooleanCommandConfirmed(config.a2_device_id,config.a2_function_code,false);d.a2_on=false;phase='waiting_a1_shutdown';await event(config,'A2 OFF',decision.reason,telemetry,d);await notify(config,'a2_off','🔥 Bomba de calor apagada',decision.reason).catch(()=>{});
      if(runtime.a1_started_by_automation){await sleep(config.a2_to_a1_delay_seconds*1000);await sendTuyaBooleanCommandConfirmed(config.a1_device_id,config.a1_function_code,false);d.a1_on=false;await event(config,'A1 OFF','A1 fue iniciado por la automatización',telemetry,d);await notify(config,'a1_off','💧 Bomba de agua apagada','A1 quedó confirmada OFF al finalizar el ciclo.').catch(()=>{})}
      runtime={cooldown_until:new Date(Date.now()+config.a2_cooldown_seconds*1000).toISOString()};phase='cooldown';
    }else if(decision.action==='sunset_shutdown'){
      const a2WasOn=d.a2_on;
      if(d.a2_on){await sendTuyaBooleanCommandConfirmed(config.a2_device_id,config.a2_function_code,false);d.a2_on=false;await event(config,'A2 OFF',decision.reason,telemetry,d);await notify(config,'a2_off','🌇 Bomba de calor apagada',decision.reason).catch(()=>{})}
      if(a2WasOn&&d.a1_on)await sleep(config.a2_to_a1_delay_seconds*1000);
      if(d.a1_on){await sendTuyaBooleanCommandConfirmed(config.a1_device_id,config.a1_function_code,false);d.a1_on=false;await event(config,'A1 OFF',decision.reason,telemetry,d);await notify(config,'a1_off','🌇 Bomba de agua apagada','Corte diario de respaldo confirmado.').catch(()=>{})}
      runtime={...runtime,condition_a_since:null,condition_b_since:null,discharge_since:null};phase='sunset_shutdown';
    }
  }catch(error){errorCode=String(error?.code||'AUTOMATION_ERROR');errorMessage=String(error?.message||error);phase=errorCode.includes('A1')?'error_a1':errorCode.includes('A2')?'error_a2':phase==='starting_a1'||phase==='waiting_circulation'?'error_a1':'error_a2';await event(config,'ERROR',errorMessage,telemetry,d,false,{code:errorCode}).catch(()=>{});await notify(config,'errors','⚠️ Error en automatización de piscina',errorMessage,{code:errorCode}).catch(()=>{})}
  finally{await db('save_state',{site_id:config.site_id,phase,runtime,telemetry,a1_on:d.a1_on,a2_on:d.a2_on,last_telemetry_at:telemetry.sampled_at,error_code:errorCode,error_message:errorMessage});await db('release',{site_id:config.site_id})}
  return {siteId:config.site_id,phase,actioned:Boolean(d.a1_on||d.a2_on),error:errorMessage};
}
export async function runPoolSolarAutomations(){const configs=await dbMode('enabled')||[],results=[];for(const config of configs)results.push(await runOne(config));return {results,ranAt:new Date().toISOString()}}
export async function recordPoolManualCommand(deviceId,code,value,actorUserId){const configs=await db('by_device',{device_id:deviceId})||[];for(const config of configs){const active=poolActiveAutomation(config);if(!active||(active==='water'&&deviceId===config.a2_device_id))continue;const until=new Date(Date.now()+config.manual_override_seconds*1000).toISOString();await db('manual_override',{site_id:config.site_id,until});await db('event',{site_id:config.site_id,event_key:crypto.randomUUID(),action:`Orden manual ${value?'ON':'OFF'}`,reason:'Prioridad manual del usuario',initiated_by:'manual',success:true,a1_on:deviceId===config.a1_device_id?Boolean(value):null,a2_on:deviceId===config.a2_device_id?Boolean(value):null,details:{device_id:deviceId,function_code:code,actor_user_id:actorUserId||null,override_until:until}})}}

async function prepareWaterOnlyMode(session,siteId,mode){
  const current=await getPoolSolarAutomation(siteId),config=current?.config;
  const claimed=await db('claim',{site_id:Number(siteId)});if(!claimed){const error=new Error('La automatización está ejecutando otra acción. Espera unos segundos.');error.status=409;throw error}
  let d={a1_on:null,a2_on:null},runtime={...(claimed.runtime||{})};
  try{
    d=await states(config);
    if(d.a2_on){await sendTuyaBooleanCommandConfirmed(config.a2_device_id,config.a2_function_code,false);d.a2_on=false;await event(config,'A2 OFF','Cambio a automatización exclusiva de bomba de agua',null,d,true,{},'manual');await notify(config,'a2_off','🔥 Bomba de calor apagada','Se activó el control exclusivo de la bomba de agua.').catch(()=>{})}
    if(mode==='manual'&&!d.a1_on){await sendTuyaBooleanCommandConfirmed(config.a1_device_id,config.a1_function_code,true);d.a1_on=true;await event(config,'A1 ON','Encendido manual exclusivo de bomba de agua',null,d,true,{},'manual');await notify(config,'a1_on','💧 Bomba de agua encendida','A1 quedó confirmada ON en modo manual.').catch(()=>{})}
    runtime={...runtime,active_automation:'water',water_control_mode:mode,manual_hold_active:mode==='manual',manual_cycle_active:mode==='manual',manual_override_until:null,a1_started_by_automation:mode==='manual'?false:runtime.a1_started_by_automation,a1_started_at:runtime.a1_started_at||runtime.a2_started_at||new Date().toISOString(),condition_a_since:null,condition_b_since:null,discharge_since:null};
    await db('save_state',{site_id:Number(siteId),phase:mode==='manual'?'manual_override':'waiting_surplus',runtime,a1_on:d.a1_on,a2_on:d.a2_on,error_code:null,error_message:null});
    return {a1On:d.a1_on,a2On:d.a2_on};
  }finally{await db('release',{site_id:Number(siteId)})}
}

export async function setPoolControlMode(session,siteId,automation,mode){
  if(!['heat','water'].includes(automation)||!['manual','off','automatic'].includes(mode)){const error=new Error('Modo de control inválido.');error.status=400;throw error}
  const current=await getPoolSolarAutomation(siteId),config=current?.config;
  if(!config){const error=new Error('Primero configura la automatización de la piscina.');error.status=400;throw error}
  if(mode!=='off'&&!config.a1_device_id){const error=new Error('Selecciona y guarda A1 antes de activar este modo.');error.status=400;throw error}
  if(automation==='heat'&&mode!=='off'&&!config.a2_device_id){const error=new Error('Selecciona y guarda A2 antes de activar la bomba de calor.');error.status=400;throw error}
  let circuit=null;
  if(automation==='heat'&&mode==='manual')circuit=await controlPoolCircuit(session,siteId,'start');
  if(automation==='water'&&mode!=='off')circuit=await prepareWaterOnlyMode(session,siteId,mode);
  const previousMode=automation==='water'?poolWaterControlMode(config):poolControlMode(config,current?.state);
  const updated=await dbMode('set',{site_id:Number(siteId),automation,mode,actor_user_id:session?.user?.id||null});
  const label=automation==='water'?'bomba de agua':'bomba de calor';
  await db('event',{site_id:Number(siteId),event_key:crypto.randomUUID(),action:`Modo ${mode} · ${label}`,reason:mode==='manual'?'Secuencia manual iniciada y confirmada':mode==='automatic'?'Control automático exclusivo habilitado':'Control neutro: sin nuevas órdenes',initiated_by:'manual',success:true,a1_on:circuit?.a1On??current?.state?.a1_on??null,a2_on:circuit?.a2On??current?.state?.a2_on??null,details:{actor_user_id:session?.user?.id||null,automation,previous_mode:previousMode,new_mode:mode,mutually_exclusive:mode!=='off'}});
  return {ok:true,automation,mode,config:updated,circuit};
}
export async function controlPoolCircuit(session,siteId,action){
  const current=await getPoolSolarAutomation(siteId),config=current?.config;if(!config?.a1_device_id||!config?.a2_device_id){const error=new Error('Selecciona y guarda A1 y A2 antes de usar el control manual.');error.status=400;throw error}
  const claimed=await db('claim',{site_id:Number(siteId)});if(!claimed){const error=new Error('La automatización está ejecutando otra acción. Espera unos segundos.');error.status=409;throw error}
  let d={a1_on:null,a2_on:null},runtime={...(claimed.runtime||{})};
  try{
    d=await states(config);const until=new Date(Date.now()+config.manual_override_seconds*1000).toISOString();
    if(action==='start'){
      await notify(config,'circuit_started','👆 Piscina: ciclo manual iniciado','El usuario ordenó encender el flujo completo.').catch(()=>{});
      const a1WasOn=d.a1_on;if(!d.a1_on){await sendTuyaBooleanCommandConfirmed(config.a1_device_id,config.a1_function_code,true);d.a1_on=true;await event(config,'A1 ON','Encendido manual del circuito',null,d,true,{},'manual');await notify(config,'a1_on','💧 Bomba de agua encendida','A1 quedó confirmada ON por orden manual.').catch(()=>{});await sleep(config.a1_to_a2_delay_seconds*1000)}
      if(!d.a2_on){await sendTuyaBooleanCommandConfirmed(config.a2_device_id,config.a2_function_code,true);d.a2_on=true;await event(config,'A2 ON','Encendido manual del circuito',null,d,true,{},'manual');await notify(config,'a2_on','🔥 Bomba de calor encendida','A2 quedó confirmada ON por orden manual.').catch(()=>{})}
      runtime={...runtime,manual_override_until:null,a1_started_by_automation:!a1WasOn,a2_started_at:new Date().toISOString(),manual_cycle_active:true,manual_hold_active:true};
    }else if(action==='stop'){
      if(d.a2_on){await sendTuyaBooleanCommandConfirmed(config.a2_device_id,config.a2_function_code,false);d.a2_on=false;await event(config,'A2 OFF','Apagado manual completo',null,d,true,{},'manual');await notify(config,'a2_off','🔥 Bomba de calor apagada','A2 quedó confirmada OFF por orden manual.').catch(()=>{});await sleep(config.a2_to_a1_delay_seconds*1000)}
      if(d.a1_on){await sendTuyaBooleanCommandConfirmed(config.a1_device_id,config.a1_function_code,false);d.a1_on=false;await event(config,'A1 OFF','Apagado manual completo',null,d,true,{},'manual');await notify(config,'a1_off','💧 Bomba de agua apagada','A1 quedó confirmada OFF por orden manual.').catch(()=>{})}
      runtime={manual_override_until:until,cooldown_until:new Date(Date.now()+config.a2_cooldown_seconds*1000).toISOString(),manual_cycle_active:false,manual_hold_active:false};
    }else{const error=new Error('Acción manual inválida.');error.status=400;throw error}
    await db('save_state',{site_id:Number(siteId),phase:action==='start'?'manual_override':config.enabled?'cooldown':'disabled',runtime,a1_on:d.a1_on,a2_on:d.a2_on,error_code:null,error_message:null});
    return {ok:true,action,a1On:d.a1_on,a2On:d.a2_on,manualOverrideUntil:action==='start'?null:until,manualHoldActive:action==='start'};
  }catch(error){await notify(config,'errors','⚠️ Falló el control manual de piscina',String(error?.message||error)).catch(()=>{});throw error}
  finally{await db('release',{site_id:Number(siteId)})}
}
export async function poolDeviceInventory(){return listTuyaDevices()}
