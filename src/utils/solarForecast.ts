import type { DailyEnergy } from '../types';
import type { RadiationDay, RadiationHour } from '../services/weather';

export type SolarModel={factor:number;installedKwp:number;sampleDays:number};

export function calibrateSolarModel(actual:DailyEnergy[],radiation:RadiationDay[],installedWp=8680):SolarModel{
 const byDate=new Map(radiation.map(r=>[r.date,r.shortwaveKwhM2]));
 const ratios=actual.filter(d=>d.solar>0.05&&(byDate.get(d.date)||0)>0.2).map(d=>d.solar/((installedWp/1000)*(byDate.get(d.date)||1)));
 ratios.sort((a,b)=>a-b);
 const median=ratios.length?ratios[Math.floor(ratios.length/2)]:0.78;
 return {factor:Math.max(0.35,Math.min(1.15,median)),installedKwp:installedWp/1000,sampleDays:ratios.length};
}
export const theoreticalDayKwh=(radiationKwhM2:number,model:SolarModel)=>Math.max(0,radiationKwhM2*model.installedKwp*model.factor);
export function theoreticalSeries(days:RadiationDay[],model:SolarModel){return days.map(d=>({date:d.date,value:theoreticalDayKwh(d.shortwaveKwhM2,model)}));}
export function expectedPowerNow(hourly:RadiationHour[]|undefined,model:SolarModel,now=new Date()){
 if(!hourly?.length)return 0; const key=now.toLocaleString('sv-SE',{timeZone:'America/Santiago'}).slice(0,13);
 const current=hourly.find(h=>h.time.slice(0,13)===key)||hourly.reduce((best,h)=>Math.abs(new Date(h.time).getTime()-now.getTime())<Math.abs(new Date(best.time).getTime()-now.getTime())?h:best,hourly[0]);
 return Math.max(0,current.shortwaveWm2*model.installedKwp*model.factor);
}
export function accumulatedTheoreticalToday(hourly:RadiationHour[]|undefined,model:SolarModel,now=new Date()){
 if(!hourly?.length)return 0; const day=now.toLocaleDateString('en-CA',{timeZone:'America/Santiago'}); const currentHour=now.toLocaleString('sv-SE',{timeZone:'America/Santiago'}).slice(0,13);
 return hourly.filter(h=>h.time.startsWith(day)&&h.time.slice(0,13)<=currentHour).reduce((sum,h)=>sum+h.shortwaveWm2/1000*model.installedKwp*model.factor,0);
}
