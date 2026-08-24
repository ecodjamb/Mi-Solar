import type { DailyEnergy, HistoryRow, TechnicalSection } from '../types';

export const SITE_TZ = 'America/Santiago';
export const API_TZ = 'Asia/Shanghai';
export const n = (v:unknown) => { const x=Number(v); return Number.isFinite(x)?x:0; };
export const isPresent = (v:unknown) => v !== undefined && v !== null && v !== '';
export function firstNumberWithSource(d:Record<string,unknown>, keys:string[]){
  for(const key of keys){ if(isPresent(d[key])){ const value=Number(d[key]); if(Number.isFinite(value)) return {value,key}; } }
  return {value:0,key:''};
}
export const firstNumber=(d:Record<string,unknown>,keys:string[])=>firstNumberWithSource(d,keys).value;
export const firstText=(d:Record<string,unknown>,keys:string[])=>{for(const key of keys){if(isPresent(d[key]))return {value:String(d[key]),key}}return {value:'',key:''}};

const KEYS = {
  pv1Power:['pvInputPower1','pvPower1','powerPv1','solarPower1','pv1Power','pvPowerInput1'],
  pv2Power:['pvInputPower2','pvPower2','powerPv2','solarPower2','pv2Power','pvPowerInput2'],
  pv1Voltage:['pvInputVoltage1','pvVoltage1','voltageInput1','pv1Voltage'],
  pv2Voltage:['pvInputVoltage2','pvVoltage2','voltageInput2','pv2Voltage'],
  pv1Current:['pvInputCurrent1','pvCurrent1','currentInput1','pv1Current'],
  pv2Current:['pvInputCurrent2','pvCurrent2','currentInput2','pv2Current'],
  loadPower:['acOutputActivePowerTotal','loadPower','outputActivePower','acOutputPower'],
  gridPower:['gridPowerInputActiveTotal','gridActivePower','acInputActivePower','gridPower'],
  chargePower:['batteryChargingPower','batteryChargePower','chargingPower'],
  dischargePower:['batteryDischargingPower','batteryDischargePower','dischargingPower'],
  soc:['batteryCapacity','batterySoc','soc','batteryPercent'],
  batteryVoltage:['batteryVoltage','batVoltage'],
  batteryCurrent:['batteryCurrent','batCurrent'],
  gridVoltage:['gridVoltage','gridVoltageR','acInputVoltageR','acInputVoltage','utilityVoltage'],
  gridFrequency:['gridFrequency','acInputFrequency','utilityFrequency'],
  outputVoltage:['acOutputVoltageR','acOutputVoltage','outputVoltage'],
  outputFrequency:['acOutputFrequency','outputFrequency'],
  temperature:['innerTemperature','inverterTemperature','temperature','temperature1'],
  heatsinkTemperature:['radiatorTemperature','heatSinkTemperature','temperature2'],
  loadPercent:['loadPercent','outputLoadPercent'],
  workMode:['workMode','workModeName','mode'],
  statusInverter:['statusInverter','inverterStatus'],
  statusGrid:['statusGrid','gridStatus'],
  statusBattery:['statusBattery','batteryStatus'],
  statusSolar1:['statusSolar1','pv1Status'],
  statusSolar2:['statusSolar2','pv2Status'],
  statusLoad:['statusLoad','loadStatus'],
  fault1:['fault1','faultCode','errorCode'],
  warning1:['warning1','warningCode']
} as const;

export const pvPower=(d:Record<string,unknown>,index:1|2)=>firstNumber(d,index===1?[...KEYS.pv1Power]:[...KEYS.pv2Power]);
export const pvVoltage=(d:Record<string,unknown>,index:1|2)=>firstNumber(d,index===1?[...KEYS.pv1Voltage]:[...KEYS.pv2Voltage]);
export const pvCurrent=(d:Record<string,unknown>,index:1|2)=>firstNumber(d,index===1?[...KEYS.pv1Current]:[...KEYS.pv2Current]);
export const loadPower=(d:Record<string,unknown>)=>firstNumber(d,[...KEYS.loadPower]);
export const gridPower=(d:Record<string,unknown>)=>firstNumber(d,[...KEYS.gridPower]);
export function gridUsage(d:Record<string,unknown>){
  const status=firstNumberWithSource(d,[...KEYS.statusGrid]);
  if(status.key)return {active:status.value===1,status:status.value,source:status.key};
  const power=gridPower(d);
  return {active:Math.abs(power)>10,status:null,source:'potencia de red (respaldo)'};
}
/** Potencia efectiva: cuando existe statusGrid, solo cuenta con estado 1. */
export const effectiveGridPower=(d:Record<string,unknown>)=>gridUsage(d).active?gridPower(d):0;
export function powerAllocation(d:Record<string,unknown>){
  const load=Math.max(0,loadPower(d));
  const solar=Math.max(0,pvPower(d,1)+pvPower(d,2));
  const grid=Math.max(0,effectiveGridPower(d));
  const discharge=Math.max(0,batteryDischargePower(d));
  const charge=Math.max(0,batteryChargePower(d));
  // La medición de red con statusGrid=1 es la fuente autoritativa. Se asigna
  // antes que batería/solar para que cobertura y costos coincidan con el
  // acumulado importado y no resten una descarga simultánea dos veces.
  const gridToLoad=Math.min(load,grid);
  const remainingAfterGrid=Math.max(0,load-gridToLoad);
  const batteryToLoad=Math.min(remainingAfterGrid,discharge);
  const solarToLoad=Math.max(0,remainingAfterGrid-batteryToLoad);
  const solarToBattery=Math.min(charge,Math.max(0,solar-solarToLoad));
  return {load,solar,grid,batteryToLoad,gridToLoad,solarToLoad,solarToBattery};
}
export const gridToLoadPower=(d:Record<string,unknown>)=>powerAllocation(d).gridToLoad;
export const solarToLoadPower=(d:Record<string,unknown>)=>powerAllocation(d).solarToLoad;
export const solarToBatteryPower=(d:Record<string,unknown>)=>powerAllocation(d).solarToBattery;
/** Aporte total del sistema solar a la casa: paneles directos + batería descargando. */
export const solarSystemToLoadPower=(d:Record<string,unknown>)=>{const allocation=powerAllocation(d);return allocation.solarToLoad+allocation.batteryToLoad};
export const batteryChargePower=(d:Record<string,unknown>)=>firstNumber(d,[...KEYS.chargePower]);
export const batteryDischargePower=(d:Record<string,unknown>)=>firstNumber(d,[...KEYS.dischargePower]);
export const batterySoc=(d:Record<string,unknown>)=>firstNumber(d,[...KEYS.soc]);
export const batteryVoltage=(d:Record<string,unknown>)=>firstNumber(d,[...KEYS.batteryVoltage]);
export const batteryCurrent=(d:Record<string,unknown>)=>firstNumber(d,[...KEYS.batteryCurrent]);
export const gridVoltage=(d:Record<string,unknown>)=>firstNumber(d,[...KEYS.gridVoltage]);
export const gridFrequency=(d:Record<string,unknown>)=>firstNumber(d,[...KEYS.gridFrequency]);
export const outputVoltage=(d:Record<string,unknown>)=>firstNumber(d,[...KEYS.outputVoltage]);
export const outputFrequency=(d:Record<string,unknown>)=>firstNumber(d,[...KEYS.outputFrequency]);
export const inverterTemperature=(d:Record<string,unknown>)=>firstNumber(d,[...KEYS.temperature]);
export const heatsinkTemperature=(d:Record<string,unknown>)=>firstNumber(d,[...KEYS.heatsinkTemperature]);

export const watts=(v:unknown)=>`${Math.round(n(v)).toLocaleString('es-CL')} W`;
export const kw=(v:unknown)=>`${(n(v)/1000).toFixed(n(v)>=10000?1:2)} kW`;
export const kwh=(v:unknown)=>`${n(v).toFixed(2)} kWh`;
export const clp=(v:unknown)=>`$${Math.round(n(v)).toLocaleString('es-CL')}`;

export function parseApiTime(v:unknown){
  if(!isPresent(v)) return null;
  if(typeof v==='number' || /^\d{10,13}$/.test(String(v))){
    const raw=Number(v); const d=new Date(raw<1e12?raw*1000:raw); return Number.isNaN(d.getTime())?null:d;
  }
  const raw=String(v).trim();
  const normalized=raw.replace(/\//g,'-').replace(' ','T');
  const hasZone=/(Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const candidate=hasZone?normalized:`${normalized}+08:00`;
  const d=new Date(candidate);
  return Number.isNaN(d.getTime())?null:d;
}
export function rowTimestamp(r:HistoryRow){return parseApiTime(r.currentTime??r.createTime??r.collectTime??r.dataTime??r.time);}
export function formatDate(v:unknown){const d=parseApiTime(v);return d?d.toLocaleString('es-CL',{timeZone:SITE_TZ,day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}):'—';}
export function formatClock(d=new Date()){return d.toLocaleTimeString('es-CL',{timeZone:SITE_TZ,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});}
export function formatSiteDate(d=new Date()){return d.toLocaleDateString('en-CA',{timeZone:SITE_TZ});}
export function siteDateKey(d:Date){return d.toLocaleDateString('en-CA',{timeZone:SITE_TZ});}

function zonedParts(date:Date,timeZone:string){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.map(p=>[p.type,p.value])) as Record<string,string>;
}
function timeZoneOffsetMs(date:Date,timeZone:string){const p=zonedParts(date,timeZone);return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-date.getTime();}
function zonedLocalToUtc(local:string,timeZone:string){
  const [datePart,timePart='00:00:00']=local.split(' '); const [y,m,d]=datePart.split('-').map(Number); const [hh,mm,ss]=timePart.split(':').map(Number);
  let guess=new Date(Date.UTC(y,m-1,d,hh,mm,ss));
  for(let i=0;i<2;i++) guess=new Date(Date.UTC(y,m-1,d,hh,mm,ss)-timeZoneOffsetMs(guess,timeZone));
  return guess;
}
function apiFormat(d:Date){const p=zonedParts(d,API_TZ);return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;}
function dateAdd(date:string,days:number){const [y,m,d]=date.split('-').map(Number);const x=new Date(Date.UTC(y,m-1,d+days));return x.toISOString().slice(0,10);}
export function siteDayBoundsUtc(date=formatSiteDate()){
  return {start:zonedLocalToUtc(`${date} 00:00:00`,SITE_TZ),end:zonedLocalToUtc(`${dateAdd(date,1)} 00:00:00`,SITE_TZ)};
}
export function siteRangeUtc(start:string,endExclusive:string){
  return {start:zonedLocalToUtc(`${start} 00:00:00`,SITE_TZ).toISOString(),end:zonedLocalToUtc(`${endExclusive} 00:00:00`,SITE_TZ).toISOString()};
}
/** Query widened to complete API calendar days; exact Santiago filtering happens client-side. */
export function chileDayApiRange(date=formatSiteDate()){
  const bounds=siteDayBoundsUtc(date); const apiStartKey=siteDateKeyInTz(bounds.start,API_TZ); const apiEndKey=siteDateKeyInTz(new Date(bounds.end.getTime()-1),API_TZ);
  return {start:`${apiStartKey} 00:00:00`,end:`${apiEndKey} 23:59:59`,siteDate:date};
}

/**
 * Divide el día local del sitio en tramos pequeños y convierte cada tramo a
 * horas exactas del servidor (Asia/Shanghai). Esto evita que el límite de
 * registros o la paginación de Tumcapp deje el gráfico detenido al mediodía.
 * Para el día actual, el último tramo termina en el minuto presente.
 */
export function chileDayApiChunks(date=formatSiteDate(), now=new Date(), chunkHours=6){
  const bounds=siteDayBoundsUtc(date);
  const isToday=date===formatSiteDate(now);
  const effectiveEnd=isToday?new Date(Math.min(now.getTime(),bounds.end.getTime())):bounds.end;
  const chunks:{start:string;end:string;siteDate:string;index:number}[]=[];
  let cursor=bounds.start.getTime();
  let index=0;
  const step=Math.max(1,chunkHours)*60*60*1000;
  while(cursor<effectiveEnd.getTime()){
    const next=Math.min(cursor+step,effectiveEnd.getTime());
    // El endpoint trabaja con intervalos inclusivos; restamos un segundo para
    // evitar duplicados exactos entre bloques (igual se deduplican al unir).
    chunks.push({
      start:apiFormat(new Date(cursor)),
      end:apiFormat(new Date(Math.max(cursor,next-1000))),
      siteDate:date,
      index
    });
    cursor=next;
    index+=1;
  }
  return chunks;
}
function siteDateKeyInTz(d:Date,tz:string){const p=zonedParts(d,tz);return `${p.year}-${p.month}-${p.day}`;}
export function chileMonthApiRange(date=formatSiteDate()){
  const [y,m]=date.split('-').map(Number); const start=`${y}-${String(m).padStart(2,'0')}-01`; const nextMonth=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
  const startUtc=zonedLocalToUtc(`${start} 00:00:00`,SITE_TZ); const endUtc=zonedLocalToUtc(`${nextMonth} 00:00:00`,SITE_TZ);
  return {start:`${siteDateKeyInTz(startUtc,API_TZ)} 00:00:00`,end:`${siteDateKeyInTz(new Date(endUtc.getTime()-1),API_TZ)} 23:59:59`,siteMonth:start.slice(0,7)};
}
export function filterRowsForSiteDate(rows:HistoryRow[],date=formatSiteDate()){
  return dedupeRows(rows).filter(r=>{const t=rowTimestamp(r);return t&&siteDateKey(t)===date;}).sort((a,b)=>Number(rowTimestamp(a))-Number(rowTimestamp(b)));
}
export function filterRowsForSiteMonth(rows:HistoryRow[],month=formatSiteDate().slice(0,7)){
  return dedupeRows(rows).filter(r=>{const t=rowTimestamp(r);return t&&siteDateKey(t).startsWith(month);}).sort((a,b)=>Number(rowTimestamp(a))-Number(rowTimestamp(b)));
}
export function dedupeRows(rows:HistoryRow[]){
  const map=new Map<string,HistoryRow>();
  rows.forEach((r,i)=>{const t=rowTimestamp(r);const key=t?String(t.getTime()):`row-${i}-${JSON.stringify(r).slice(0,100)}`;map.set(key,r);});
  return [...map.values()];
}
export function integrate(rows:HistoryRow[], selector:(r:HistoryRow)=>number){
  const aggregated=rows.some(row=>Number(row.aggregateSamples||0)>0);
  if(aggregated)return dedupeRows(rows).reduce((wh,row)=>{const hours=Number(row.aggregateHours||1);const coverage=hours===1?Math.min(1,Math.max(1,Number(row.aggregateSamples||12))/12):hours;return wh+Math.max(0,selector(row))*coverage},0)/1000;
  const pts=dedupeRows(rows).map(r=>({t:rowTimestamp(r),p:Math.max(0,selector(r))})).filter((x):x is {t:Date;p:number}=>Boolean(x.t)).sort((a,b)=>a.t.getTime()-b.t.getTime());
  if(pts.length<2) return 0;
  const intervals:number[]=[]; for(let i=1;i<pts.length;i++){const h=(pts[i].t.getTime()-pts[i-1].t.getTime())/36e5;if(h>0&&h<=1)intervals.push(h);}
  const sorted=[...intervals].sort((a,b)=>a-b); const median=sorted.length?sorted[Math.floor(sorted.length/2)]:5/60; const maxGap=Math.min(.5,Math.max(median*3,.1));
  let wh=0; for(let i=1;i<pts.length;i++){const h=(pts[i].t.getTime()-pts[i-1].t.getTime())/36e5;if(h<=0||h>maxGap)continue;wh+=(pts[i].p+pts[i-1].p)/2*h;}
  return wh/1000;
}
export function dailyEnergy(inputRows:HistoryRow[]):DailyEnergy {
  const rows=dedupeRows(inputRows).sort((a,b)=>Number(rowTimestamp(a))-Number(rowTimestamp(b))); const first=rowTimestamp(rows[0]||{}); const last=rowTimestamp(rows[rows.length-1]||{});
  const gridImport=integrate(rows,r=>Math.max(0,effectiveGridPower(r))); const gridExport=integrate(rows,r=>Math.max(0,-effectiveGridPower(r)));
  const batteryToLoad=integrate(rows,r=>powerAllocation(r).batteryToLoad);
  const gridToLoad=integrate(rows,r=>powerAllocation(r).gridToLoad);
  const solarToLoad=integrate(rows,r=>powerAllocation(r).solarToLoad);
  const solarToBattery=integrate(rows,r=>powerAllocation(r).solarToBattery);
  const samples=rows.some(row=>Number(row.aggregateSamples||0)>0)?rows.reduce((sum,row)=>sum+Number(row.aggregateSamples||0),0):rows.length;
  return {date:'',solar:integrate(rows,r=>pvPower(r,1)+pvPower(r,2)),pv1:integrate(rows,r=>pvPower(r,1)),pv2:integrate(rows,r=>pvPower(r,2)),load:integrate(rows,loadPower),grid:gridImport,gridImport,gridExport,gridToLoad,charge:integrate(rows,batteryChargePower),discharge:integrate(rows,batteryDischargePower),solarToLoad,batteryToLoad,solarToBattery,samples,firstSample:first?.toISOString(),lastSample:last?.toISOString()};
}
export function detectPvCount(d:Record<string,unknown>,rows:HistoryRow[]=[]){const hasPv2=rows.some(r=>pvPower(r,2)>0||pvVoltage(r,2)>0||firstNumber(r,[...KEYS.statusSolar2])===1);return hasPv2||pvPower(d,2)!==0||pvVoltage(d,2)>0||firstNumber(d,[...KEYS.statusSolar2])===1?2:1;}
export function health(d:Record<string,unknown>){let s=100;if(firstNumber(d,[...KEYS.statusInverter])!==1)s-=25;if(inverterTemperature(d)>55)s-=15;if(firstNumber(d,[...KEYS.fault1])>0)s-=30;if(firstNumber(d,[...KEYS.warning1])>0)s-=10;const a=pvPower(d,1),b=pvPower(d,2);if(a>300&&b>0&&Math.min(a,b)/Math.max(a,b)<.55)s-=10;return Math.max(0,s);}

function item(d:Record<string,unknown>,key:string,label:string,aliases:string[],unit?:string,status?:TechnicalSection['items'][number]['status']){const found=firstNumberWithSource(d,aliases);return {key,label,value:found.key?found.value:null,unit,source:found.key||undefined,status};}
function textItem(d:Record<string,unknown>,key:string,label:string,aliases:string[]){const found=firstText(d,aliases);return {key,label,value:found.key?found.value:null,source:found.key||undefined,status:'info' as const};}
export function technicalCatalog(d:Record<string,unknown>,summary:Record<string,unknown>={},gridLabel='Red eléctrica'):TechnicalSection[]{
  const merged={...summary,...d};
  return [
    {title:'Solar / MPPT',items:[item(merged,'pv1Power','Potencia PV1',[...KEYS.pv1Power],'W'),item(merged,'pv1Voltage','Voltaje PV1',[...KEYS.pv1Voltage],'V'),item(merged,'pv1Current','Corriente PV1',[...KEYS.pv1Current],'A'),item(merged,'pv2Power','Potencia PV2',[...KEYS.pv2Power],'W'),item(merged,'pv2Voltage','Voltaje PV2',[...KEYS.pv2Voltage],'V'),item(merged,'pv2Current','Corriente PV2',[...KEYS.pv2Current],'A')]},
    {title:'Salida / cargas',items:[item(merged,'loadPower','Potencia de carga',[...KEYS.loadPower],'W'),item(merged,'loadPercent','Carga del inversor',[...KEYS.loadPercent],'%'),item(merged,'outputVoltage','Voltaje de salida',[...KEYS.outputVoltage],'V'),item(merged,'outputFrequency','Frecuencia de salida',[...KEYS.outputFrequency],'Hz')]},
    {title:gridLabel,items:[item(merged,'gridPower',`Potencia de ${gridLabel.toLocaleLowerCase('es-CL')}`,[...KEYS.gridPower],'W'),item(merged,'statusGrid',`Uso efectivo de ${gridLabel.toLocaleLowerCase('es-CL')}`,[...KEYS.statusGrid]),item(merged,'gridVoltage',`Voltaje de ${gridLabel.toLocaleLowerCase('es-CL')}`,[...KEYS.gridVoltage],'V'),item(merged,'gridFrequency',`Frecuencia de ${gridLabel.toLocaleLowerCase('es-CL')}`,[...KEYS.gridFrequency],'Hz')]},
    {title:'Batería',items:[item(merged,'soc','Estado de carga',[...KEYS.soc],'%'),item(merged,'batteryVoltage','Voltaje de batería',[...KEYS.batteryVoltage],'V'),item(merged,'batteryCurrent','Corriente de batería',[...KEYS.batteryCurrent],'A'),item(merged,'chargePower','Potencia de carga',[...KEYS.chargePower],'W'),item(merged,'dischargePower','Potencia de descarga',[...KEYS.dischargePower],'W')]},
    {title:'Inversor',items:[textItem(merged,'workMode','Modo de trabajo',[...KEYS.workMode]),item(merged,'temperature','Temperatura interna',[...KEYS.temperature],'°C'),item(merged,'heatsinkTemperature','Temperatura disipador',[...KEYS.heatsinkTemperature],'°C'),item(merged,'statusInverter','Estado inversor',[...KEYS.statusInverter]),item(merged,'fault','Código de falla',[...KEYS.fault1]),item(merged,'warning','Código de advertencia',[...KEYS.warning1])]},
    {title:'Estados digitales',items:[item(merged,'statusSolar1','Estado PV1',[...KEYS.statusSolar1]),item(merged,'statusSolar2','Estado PV2',[...KEYS.statusSolar2]),item(merged,'statusGrid',`Estado ${gridLabel.toLocaleLowerCase('es-CL')}`,[...KEYS.statusGrid]),item(merged,'statusBattery','Estado batería',[...KEYS.statusBattery]),item(merged,'statusLoad','Estado carga',[...KEYS.statusLoad])]}];
}
export function dataQuality(rows:HistoryRow[],expectedDate=formatSiteDate()){
  const filtered=filterRowsForSiteDate(rows,expectedDate); const first=rowTimestamp(filtered[0]||{}); const last=rowTimestamp(filtered[filtered.length-1]||{}); const nowKey=formatSiteDate();
  const expectedEnd=expectedDate===nowKey?new Date():siteDayBoundsUtc(expectedDate).end;
  const coverageStart=first?Math.max(0,(first.getTime()-siteDayBoundsUtc(expectedDate).start.getTime())/36e5):24;
  const coverageEnd=last?Math.max(0,(expectedEnd.getTime()-last.getTime())/36e5):24;
  return {samples:filtered.length,first,last,coverageStartHours:coverageStart,coverageEndHours:coverageEnd,complete:filtered.length>=2&&coverageStart<=1&&coverageEnd<=1.5};
}

export function siteWeekDateRange(date=formatSiteDate()){
  const [y,m,d]=date.split('-').map(Number);
  const weekday=new Date(Date.UTC(y,m-1,d,12)).getUTCDay();
  const daysFromMonday=(weekday+6)%7;
  const start=dateAdd(date,-daysFromMonday);
  const end=dateAdd(start,7);
  return {start,end};
}
export function chileWeekApiRange(date=formatSiteDate()){
  const range=siteWeekDateRange(date); const startUtc=zonedLocalToUtc(`${range.start} 00:00:00`,SITE_TZ); const endUtc=zonedLocalToUtc(`${range.end} 00:00:00`,SITE_TZ);
  return {start:`${siteDateKeyInTz(startUtc,API_TZ)} 00:00:00`,end:`${siteDateKeyInTz(new Date(endUtc.getTime()-1),API_TZ)} 23:59:59`,siteStart:range.start,siteEnd:range.end};
}
export function filterRowsForSiteRange(rows:HistoryRow[],start:string,endExclusive:string){
  return dedupeRows(rows).filter(r=>{const t=rowTimestamp(r);if(!t)return false;const key=siteDateKey(t);return key>=start&&key<endExclusive;}).sort((a,b)=>Number(rowTimestamp(a))-Number(rowTimestamp(b)));
}
export function groupDailyEnergy(rows:HistoryRow[]){
  const groups=new Map<string,HistoryRow[]>();
  dedupeRows(rows).forEach(r=>{const t=rowTimestamp(r);if(!t)return;const key=siteDateKey(t);groups.set(key,[...(groups.get(key)||[]),r]);});
  return [...groups].map(([date,group])=>({...dailyEnergy(group),date})).sort((a,b)=>a.date.localeCompare(b.date));
}

/** Converts an arbitrary Santiago date range [start, endExclusive) to complete API/China calendar days. */
export function chileSiteRangeApiRange(siteStart:string,siteEndExclusive:string){
  const startUtc=zonedLocalToUtc(`${siteStart} 00:00:00`,SITE_TZ);
  const endUtc=zonedLocalToUtc(`${siteEndExclusive} 00:00:00`,SITE_TZ);
  return {
    start:`${siteDateKeyInTz(startUtc,API_TZ)} 00:00:00`,
    end:`${siteDateKeyInTz(new Date(endUtc.getTime()-1),API_TZ)} 23:59:59`,
    siteStart,
    siteEnd:siteEndExclusive
  };
}
