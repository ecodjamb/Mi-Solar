import type { DailyEnergy } from '../types';
import type { RadiationDay, RadiationHour } from '../services/weather';

export type SolarModel={
  factor:number;
  installedKwp:number;
  sampleDays:number;
  medianErrorPct:number;
  liveCorrection:number;
  hourlyShade:number[];
  seasonalSamples:{date:string;ratio:number}[];
};

// Perfil inicial de El Arrayán: pérdidas por obstáculos del horizonte, separadas
// del factor meteorológico. Queda centralizado para recalibrarlo con el documento.
const ARRAYAN_SHADE=[0,0,0,0,0,0,.28,.48,.64,.76,.84,.9,.92,.9,.86,.8,.7,.55,.3,.08,0,0,0,0];
function shadeProfile(installedWp:number){
  if(installedWp<=5000)return Array(24).fill(1);
  // El factor histórico ya incorpora la pérdida diaria total. Normalizar evita
  // contarla dos veces y distribuye esa pérdida en las horas donde ocurre.
  const daylight=ARRAYAN_SHADE.filter(value=>value>0);
  const average=daylight.reduce((sum,value)=>sum+value,0)/daylight.length;
  return ARRAYAN_SHADE.map(value=>value/average);
}

function median(values:number[]){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}

function siteDate(now=new Date()){
  return now.toLocaleDateString('en-CA',{timeZone:'America/Santiago'});
}

export function calibrateSolarModel(actual:DailyEnergy[],radiation:RadiationDay[],installedWp=8680, todayActual?:DailyEnergy):SolarModel{
  const byDate=new Map(radiation.map(r=>[r.date,r.shortwaveKwhM2]));
  const today=siteDate();
  const completed=actual
    .filter(d=>d.date<today&&d.solar>0.35&&d.samples>=20&&(byDate.get(d.date)||0)>0.5)
    .slice(-24);
  const seasonalSamples=completed.map(d=>({date:d.date,ratio:d.solar/((installedWp/1000)*(byDate.get(d.date)||1))})).filter(x=>Number.isFinite(x.ratio)&&x.ratio>0.15&&x.ratio<1.35);
  let ratios=seasonalSamples.map(item=>item.ratio);
  if(ratios.length>=5){
    const sorted=[...ratios].sort((a,b)=>a-b);
    const trim=Math.floor(sorted.length*.12);
    ratios=sorted.slice(trim,sorted.length-trim||undefined);
  }
  const historicalFactor=ratios.length?median(ratios):0.62;
  const errors=completed.map(d=>{
    const expected=(byDate.get(d.date)||0)*(installedWp/1000)*historicalFactor;
    return expected>0?Math.abs(d.solar-expected)/expected*100:0;
  });
  let liveCorrection=1;
  if(todayActual&&todayActual.solar>0.4){
    const todaysRadiation=byDate.get(today)||0;
    const baseline=todaysRadiation*(installedWp/1000)*historicalFactor;
    if(baseline>2){
      const raw=todayActual.solar/baseline;
      // El dato del día todavía está incompleto: se mezcla suavemente con el histórico.
      const progress=Math.min(.75,Math.max(.2,todayActual.solar/Math.max(4,baseline)));
      liveCorrection=Math.max(.45,Math.min(1.2,1+(raw-1)*progress));
    }
  }
  return {
    factor:Math.max(.25,Math.min(1.05,historicalFactor)),
    installedKwp:installedWp/1000,
    sampleDays:ratios.length,
    medianErrorPct:median(errors),
    liveCorrection,
    hourlyShade:shadeProfile(installedWp),
    seasonalSamples
  };
}

function circularDayDistance(a:string,b:string){
  const day=(value:string)=>{const date=new Date(`${value}T12:00:00Z`);return Math.floor((date.getTime()-Date.UTC(date.getUTCFullYear(),0,0))/86400000)};
  const distance=Math.abs(day(a)-day(b));
  return Math.min(distance,365-distance);
}

export function seasonalFactor(date:string,model:SolarModel){
  if(model.seasonalSamples.length<5)return model.factor;
  const weighted=model.seasonalSamples.map(sample=>({value:sample.ratio,weight:Math.exp(-Math.pow(circularDayDistance(date,sample.date)/55,2))}));
  const weight=weighted.reduce((sum,item)=>sum+item.weight,0);
  if(weight<1.2)return model.factor;
  const local=weighted.reduce((sum,item)=>sum+item.value*item.weight,0)/weight;
  // Mezcla la época equivalente con el factor global para no sobreajustar pocos días.
  const confidence=Math.min(.72,model.seasonalSamples.length/28);
  return Math.max(.25,Math.min(1.05,model.factor*(1-confidence)+local*confidence));
}

export const theoreticalDayKwh=(radiationKwhM2:number,model:SolarModel,applyLive=false,date=siteDate())=>
  Math.max(0,radiationKwhM2*model.installedKwp*seasonalFactor(date,model)*(applyLive?model.liveCorrection:1));

export function theoreticalSeries(days:RadiationDay[],model:SolarModel){
  const today=siteDate();
  return days.map(d=>({date:d.date,value:theoreticalDayKwh(d.shortwaveKwhM2,model,d.date>=today,d.date)}));
}

function nearestHour(hourly:RadiationHour[], now:Date){
  const key=now.toLocaleString('sv-SE',{timeZone:'America/Santiago'}).slice(0,13);
  return hourly.find(h=>h.time.slice(0,13)===key)||hourly.reduce((best,h)=>Math.abs(new Date(h.time).getTime()-now.getTime())<Math.abs(new Date(best.time).getTime()-now.getTime())?h:best,hourly[0]);
}

export function expectedPowerNow(hourly:RadiationHour[]|undefined,model:SolarModel,now=new Date()){
  if(!hourly?.length)return 0;
  const current=nearestHour(hourly,now);
  const hour=Number(current.time.slice(11,13));
  return Math.max(0,current.shortwaveWm2*model.installedKwp*model.factor*model.liveCorrection*(model.hourlyShade[hour]??1));
}

export function accumulatedTheoreticalToday(hourly:RadiationHour[]|undefined,model:SolarModel,now=new Date()){
  if(!hourly?.length)return 0;
  const day=siteDate(now);
  const currentHour=now.toLocaleString('sv-SE',{timeZone:'America/Santiago'}).slice(0,13);
  return hourly
    .filter(h=>h.time.startsWith(day)&&h.time.slice(0,13)<=currentHour)
    .reduce((sum,h)=>sum+h.shortwaveWm2/1000*model.installedKwp*model.factor*model.liveCorrection*(model.hourlyShade[Number(h.time.slice(11,13))]??1),0);
}
