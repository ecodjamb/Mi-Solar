const KEYS={
  pv1:['pvInputPower1','pvPower1','powerPv1','solarPower1','pv1Power','pvPowerInput1'],
  pv2:['pvInputPower2','pvPower2','powerPv2','solarPower2','pv2Power','pvPowerInput2'],
  load:['acOutputActivePowerTotal','loadPower','outputActivePower','acOutputPower'],
  grid:['gridPowerInputActiveTotal','gridActivePower','acInputActivePower','gridPower'],
  gridStatus:['statusGrid','gridStatus'],
  charge:['batteryChargingPower','batteryChargePower','chargingPower'],
  discharge:['batteryDischargingPower','batteryDischargePower','dischargingPower'],
  soc:['batteryCapacity','batterySoc','soc','batteryPercent']
};

const first=(row,keys)=>{for(const key of keys){const value=Number(row?.[key]);if(row?.[key]!==''&&Number.isFinite(value))return value}return 0};
const timestamp=(row)=>{
  const raw=row?.currentTime??row?.createTime??row?.collectTime??row?.dataTime??row?.time;
  if(raw==null)return null;
  if(typeof raw==='number'||/^\d{10,13}$/.test(String(raw))){const n=Number(raw);const date=new Date(n<1e12?n*1000:n);return Number.isNaN(date.getTime())?null:date}
  const normalized=String(raw).trim().replace(/\//g,'-').replace(' ','T');
  const date=new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(normalized)?normalized:`${normalized}+08:00`);
  return Number.isNaN(date.getTime())?null:date;
};

function config(){
  const url=process.env.SUPABASE_URL?.trim();
  const serverKey=(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const key=serverKey||process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const appKey=process.env.MISOLAR_DB_KEY?.trim();
  return url&&key&&(serverKey||appKey)?{url,key,appKey,serverKey:Boolean(serverKey)}:null;
}

export async function rest(path,options={}){
  const value=config();
  if(!value)return null;
  const response=await fetch(`${value.url}/rest/v1/${path}`,{
    ...options,
    headers:{apikey:value.key,Authorization:`Bearer ${value.key}`,...(!value.serverKey?{'x-misolar-key':value.appKey}:{}),'Content-Type':'application/json',...(options.headers||{})}
  });
  if(!response.ok)throw new Error(`Archivo permanente HTTP ${response.status}: ${(await response.text()).slice(0,180)}`);
  if(response.status===204)return null;
  const text=await response.text();
  return text?JSON.parse(text):null;
}

export async function findSiteId(deviceSn){
  const siteReference=String(deviceSn||'').match(/^site:(\d+)$/);
  if(siteReference){
    const rows=await rest(`solar_sites?id=eq.${siteReference[1]}&select=id&limit=1`);
    return rows?.[0]?.id||null;
  }
  const existing=await rest(`solar_sites?device_sn=eq.${encodeURIComponent(deviceSn)}&select=id&limit=1`);
  if(existing?.[0]?.id)return existing[0].id;
  const catalog=await rest('solar_sites?select=id,device_sn');
  return catalog?.find(site=>String(site.device_sn)===String(deviceSn))?.id||null;
}

export function validDeviceReference(value){
  return /^\d{8,20}$/.test(String(value||''))||/^site:\d+$/.test(String(value||''));
}

export async function resolveDeviceReference(value){
  const reference=String(value||'');
  const match=reference.match(/^site:(\d+)$/);
  if(!match)return /^\d{8,20}$/.test(reference)?reference:null;
  const rows=await rest(`solar_sites?id=eq.${match[1]}&select=device_sn&limit=1`);
  return rows?.[0]?.device_sn?String(rows[0].device_sn):null;
}

export async function ensureSite(deviceSn,name=deviceSn){
  const existingId=await findSiteId(deviceSn);
  if(existingId)return existingId;
  const created=await rest('solar_sites',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({device_sn:deviceSn,name})});
  return created?.[0]?.id||null;
}

function sample(siteId,row,{bucketMinutes=0}={}){
  const date=timestamp(row);
  if(!date)return null;
  if(bucketMinutes){const size=bucketMinutes*60_000;date.setTime(Math.floor(date.getTime()/size)*size)}
  const pv1=first(row,KEYS.pv1),pv2=first(row,KEYS.pv2);
  const statusKey=KEYS.gridStatus.find(key=>row?.[key]!==undefined&&row?.[key]!==null&&row?.[key]!=='');
  const rawGrid=first(row,KEYS.grid);
  const gridActive=statusKey?first(row,[statusKey])===1:Math.abs(rawGrid)>10;
  return {site_id:siteId,sample_at:date.toISOString(),solar_w:pv1+pv2,pv1_w:pv1,pv2_w:pv2,load_w:first(row,KEYS.load),grid_w:gridActive?rawGrid:0,grid_active:gridActive,battery_charge_w:first(row,KEYS.charge),battery_discharge_w:first(row,KEYS.discharge),battery_soc:first(row,KEYS.soc),raw:row};
}

export async function archiveRows(deviceSn,rows,options={}){
  if(!config()||!deviceSn||!rows?.length)return {stored:0,configured:Boolean(config())};
  const siteId=await ensureSite(deviceSn,options.siteName||deviceSn);
  const records=rows.map(row=>sample(siteId,row,options)).filter(Boolean);
  for(let offset=0;offset<records.length;offset+=500){
    await rest('energy_samples?on_conflict=site_id,sample_at',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(records.slice(offset,offset+500))});
  }
  return {stored:records.length,configured:true};
}

export async function readArchive(deviceSn,startIso,endIso){
  if(!config())return {rows:[],configured:false};
  const siteId=await findSiteId(deviceSn);
  if(!siteId)return {rows:[],configured:true};
  const rows=await rest(`energy_samples?site_id=eq.${siteId}&sample_at=gte.${encodeURIComponent(startIso)}&sample_at=lt.${encodeURIComponent(endIso)}&select=raw&order=sample_at.asc&limit=20000`);
  return {rows:(rows||[]).map(item=>item.raw),configured:true};
}

export async function readArchiveSeries(deviceSn,startIso,endIso,resolution='hour'){
  if(!config())return {rows:[],configured:false};
  const siteId=await findSiteId(deviceSn);
  if(!siteId)return {rows:[],configured:true};
  const view=resolution==='day'?'energy_daily':'energy_hourly';
  const rows=await rest(`${view}?site_id=eq.${siteId}&bucket_at=gte.${encodeURIComponent(startIso)}&bucket_at=lt.${encodeURIComponent(endIso)}&select=bucket_at,solar_w,pv1_w,pv2_w,load_w,grid_w,grid_active,battery_charge_w,battery_discharge_w,battery_soc,samples,coverage_hours&order=bucket_at.asc&limit=10000`);
  return {rows:(rows||[]).map(row=>({
    currentTime:row.bucket_at,
    pvInputPower1:Number(row.pv1_w||0),
    pvInputPower2:Number(row.pv2_w||0),
    acOutputActivePowerTotal:Number(row.load_w||0),
    gridPowerInputActiveTotal:Number(row.grid_w||0),
    statusGrid:row.grid_active?1:0,
    batteryChargingPower:Number(row.battery_charge_w||0),
    batteryDischargingPower:Number(row.battery_discharge_w||0),
    batteryCapacity:row.battery_soc==null?undefined:Number(row.battery_soc),
    aggregateSamples:Number(row.samples||0),
    aggregateHours:archiveAggregateHours(row,resolution)
  })),configured:true,resolution};
}

export async function readLatestEnergySample(siteId){
  if(!config())return null;
  const rows=await rest(`energy_samples?site_id=eq.${Number(siteId)}&select=id,site_id,sample_at,solar_w,pv1_w,pv2_w,load_w,grid_w,grid_active,battery_charge_w,battery_discharge_w,battery_soc,source,ingested_at&order=sample_at.desc&limit=1`);
  return rows?.[0]||null;
}

export async function readEnergySamples(siteId,startIso,endIso,limit=20000){
  if(!config())return [];
  return await rest(`energy_samples?site_id=eq.${Number(siteId)}&sample_at=gte.${encodeURIComponent(startIso)}&sample_at=lt.${encodeURIComponent(endIso)}&select=id,site_id,sample_at,solar_w,pv1_w,pv2_w,load_w,grid_w,grid_active,battery_charge_w,battery_discharge_w,battery_soc,source,ingested_at&order=sample_at.asc&limit=${Math.min(20000,Math.max(1,Number(limit)||10000))}`)||[];
}

export function archiveAggregateHours(row,resolution='hour'){
  const coverage=Number(row?.coverage_hours);
  if(Number.isFinite(coverage)&&coverage>=0)return coverage;
  return resolution==='day'?0:1;
}
