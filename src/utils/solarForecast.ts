import type { DailyEnergy } from '../types';
import type { RadiationDay, RadiationHour } from '../services/weather';

export type SolarModel={
  factor:number;
  installedKwp:number;
  sampleDays:number;
  medianErrorPct:number;
  liveCorrection:number;
  slopeKwhPerRadiation:number;
  interceptKwh:number;
  rSquared:number;
  hourlyShade:number[];
  seasonalSamples:{date:string;radiation:number;actual:number;ratio:number}[];
  siteKey:'arrayan'|'puerto-montt';
};

export type SeasonKey='summer'|'autumn'|'winter'|'spring';
export type SeasonProfile={key:SeasonKey;name:string;months:string;generation:[number,number];nightLoad:[number,number];sunHours:[number,number];radiation:[number,number];balance?:[number,number];generationNote?:string;summary:string;battery:string};

export const SEASON_PROFILES:Record<'arrayan'|'puerto-montt',Record<SeasonKey,SeasonProfile>>={
  arrayan:{
    winter:{key:'winter',name:'Invierno',months:'Junio · Julio · Agosto',generation:[6.7,6.7],nightLoad:[18,18],sunHours:[10,10],radiation:[3,4],balance:[-36,-36],generationNote:'Dato real promedio indicado en la infografía.',summary:'Pocas horas de sol, sol muy bajo y sombras fuertes de árboles laterales.',battery:'10 kWh: difícil de llenar; 15 kWh: aún más difícil.'},
    spring:{key:'spring',name:'Primavera',months:'Septiembre · Octubre · Noviembre',generation:[16,22],nightLoad:[12,12],sunHours:[11,12],radiation:[5,6],balance:[-27,-21],summary:'Sol más alto, menos sombra y generación creciente.',battery:'10 kWh se aprovecha bien; 15 kWh puede llenarse en días buenos.'},
    summer:{key:'summer',name:'Verano',months:'Diciembre · Enero · Febrero',generation:[30,40],nightLoad:[9,10],sunHours:[14,14],radiation:[8,10],balance:[-13,-3],generationNote:'En días excepcionales puede superar 45 kWh.',summary:'Más horas de sol, sombra mínima y excedentes frecuentes.',battery:'10 kWh se llena temprano; 15 kWh ofrece mejor equilibrio.'},
    autumn:{key:'autumn',name:'Otoño',months:'Marzo · Abril · Mayo',generation:[14,20],nightLoad:[16,16],sunHours:[11,12],radiation:[5,7],balance:[-29,-23],summary:'Bajan progresivamente el sol, las horas y la generación.',battery:'10 kWh razonable; 15 kWh útil, aunque no se llena todos los días.'}
  },
  'puerto-montt':{
    winter:{key:'winter',name:'Invierno',months:'Junio · Julio · Agosto',generation:[3,6],nightLoad:[5,9],sunHours:[8,9],radiation:[2,3],summary:'Días cortos, nubosidad y lluvia frecuentes; referencia ajustada al rendimiento real local.',battery:'La generación se prioriza para consumo y recuperación mínima de batería.'},
    spring:{key:'spring',name:'Primavera',months:'Septiembre · Octubre · Noviembre',generation:[5,9],nightLoad:[5,8],sunHours:[11,13],radiation:[3.5,5],summary:'Aumentan las horas de luz, con alta variabilidad por nubosidad costera.',battery:'Mejora la recuperación diaria, pero se conserva margen para días lluviosos.'},
    summer:{key:'summer',name:'Verano',months:'Diciembre · Enero · Febrero',generation:[7,12],nightLoad:[4,7],sunHours:[14,16],radiation:[4.5,6],summary:'Máxima duración del día; la nubosidad sigue siendo el principal ajuste.',battery:'Mayor probabilidad de carga completa y menor uso del generador.'},
    autumn:{key:'autumn',name:'Otoño',months:'Marzo · Abril · Mayo',generation:[4,8],nightLoad:[5,8],sunHours:[10,12],radiation:[3,4.5],summary:'La producción disminuye con rapidez y aumenta la dependencia del respaldo.',battery:'Conviene reservar carga para la noche y vigilar varios días consecutivos nublados.'}
  }
};

export function seasonForDate(date:string):SeasonKey{const month=Number(date.slice(5,7));if(month===12||month<=2)return'summer';if(month<=5)return'autumn';if(month<=8)return'winter';return'spring'}
export const seasonProfile=(date:string,siteKey:'arrayan'|'puerto-montt')=>SEASON_PROFILES[siteKey][seasonForDate(date)];

// Perfil inicial de El Arrayán: pérdidas por obstáculos del horizonte, separadas
// del factor meteorológico. Queda centralizado para recalibrarlo con el documento.
const ARRAYAN_SHADE=[0,0,0,0,0,0,.28,.48,.64,.76,.84,.9,.92,.9,.86,.8,.7,.55,.3,.08,0,0,0,0];
function shadeProfile(siteKey:'arrayan'|'puerto-montt'){
  if(siteKey==='puerto-montt')return Array(24).fill(1);
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

type Regression={slope:number;intercept:number;rSquared:number};

function weightedRegression(samples:SolarModel['seasonalSamples'],installedKwp:number,targetDate?:string):Regression{
  if(samples.length<3)return{slope:installedKwp*.62,intercept:0,rSquared:0};
  const weighted=samples.map(sample=>({
    ...sample,
    weight:targetDate?Math.exp(-Math.pow(circularDayDistance(targetDate,sample.date)/62,2)):1
  }));
  const totalWeight=weighted.reduce((sum,item)=>sum+item.weight,0);
  const meanX=weighted.reduce((sum,item)=>sum+item.radiation*item.weight,0)/totalWeight;
  const meanY=weighted.reduce((sum,item)=>sum+item.actual*item.weight,0)/totalWeight;
  const covariance=weighted.reduce((sum,item)=>sum+item.weight*(item.radiation-meanX)*(item.actual-meanY),0);
  const variance=weighted.reduce((sum,item)=>sum+item.weight*Math.pow(item.radiation-meanX,2),0);
  const rawSlope=variance>.02?covariance/variance:median(weighted.map(item=>item.actual/item.radiation));
  const slope=Math.max(installedKwp*.18,Math.min(installedKwp*1.05,rawSlope));
  const rawIntercept=meanY-slope*meanX;
  const intercept=Math.max(-installedKwp*.8,Math.min(installedKwp*.8,rawIntercept));
  const residual=weighted.reduce((sum,item)=>sum+item.weight*Math.pow(item.actual-(slope*item.radiation+intercept),2),0);
  const total=weighted.reduce((sum,item)=>sum+item.weight*Math.pow(item.actual-meanY,2),0);
  return{slope,intercept,rSquared:total>.01?Math.max(0,Math.min(1,1-residual/total)):0};
}

export function calibrateSolarModel(actual:DailyEnergy[],radiation:RadiationDay[],installedWp=8680, todayActual?:DailyEnergy,siteKey:'arrayan'|'puerto-montt'='arrayan'):SolarModel{
  const byDate=new Map(radiation.map(r=>[r.date,r.shortwaveKwhM2]));
  const today=siteDate();
  const completed=actual
    .filter(d=>d.date<today&&d.solar>0.35&&d.samples>=120&&(byDate.get(d.date)||0)>0.5)
    .slice(-60);
  const rawSamples=completed.map(d=>({date:d.date,radiation:byDate.get(d.date)||0,actual:d.solar,ratio:d.solar/((installedWp/1000)*(byDate.get(d.date)||1))})).filter(x=>Number.isFinite(x.ratio)&&x.ratio>0.12&&x.ratio<1.35);
  const center=median(rawSamples.map(item=>item.ratio));
  const mad=median(rawSamples.map(item=>Math.abs(item.ratio-center)));
  const filteredSamples=rawSamples.filter(item=>Math.abs(item.ratio-center)<=Math.max(.1,mad*3));
  const seasonalSamples=filteredSamples.length>=3?filteredSamples:rawSamples;
  let ratios=seasonalSamples.map(item=>item.ratio);
  if(ratios.length>=5){
    const sorted=[...ratios].sort((a,b)=>a-b);
    const trim=Math.floor(sorted.length*.12);
    ratios=sorted.slice(trim,sorted.length-trim||undefined);
  }
  const historicalFactor=ratios.length?median(ratios):0.62;
  const regression=weightedRegression(seasonalSamples,installedWp/1000,today);
  const errors=seasonalSamples.map(sample=>{
    const expected=Math.max(0,regression.slope*sample.radiation+regression.intercept);
    return expected>0?Math.abs(sample.actual-expected)/expected*100:0;
  });
  let liveCorrection=1;
  if(todayActual&&todayActual.solar>0.4){
    const todaysRadiation=byDate.get(today)||0;
    const baseline=Math.max(0,todaysRadiation*regression.slope+regression.intercept);
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
    slopeKwhPerRadiation:regression.slope,
    interceptKwh:regression.intercept,
    rSquared:regression.rSquared,
    hourlyShade:shadeProfile(siteKey),
    seasonalSamples,
    siteKey
  };
}

function circularDayDistance(a:string,b:string){
  const day=(value:string)=>{const date=new Date(`${value}T12:00:00Z`);return Math.floor((date.getTime()-Date.UTC(date.getUTCFullYear(),0,0))/86400000)};
  const distance=Math.abs(day(a)-day(b));
  return Math.min(distance,365-distance);
}

export function seasonalFactor(date:string,model:SolarModel){
  return projectionCoefficients(date,model).slope/model.installedKwp;
}

export function projectionCoefficients(date:string,model:SolarModel):Regression{
  if(model.seasonalSamples.length<5)return{slope:model.slopeKwhPerRadiation,intercept:model.interceptKwh,rSquared:model.rSquared};
  const local=weightedRegression(model.seasonalSamples,model.installedKwp,date);
  const confidence=Math.min(.82,.48+model.seasonalSamples.length/55);
  return{
    slope:model.slopeKwhPerRadiation*(1-confidence)+local.slope*confidence,
    intercept:model.interceptKwh*(1-confidence)+local.intercept*confidence,
    rSquared:local.rSquared
  };
}

export const theoreticalDayKwh=(radiationKwhM2:number,model:SolarModel,applyLive=false,date=siteDate())=>{
  const coefficients=projectionCoefficients(date,model);
  const radiationEstimate=Math.max(0,(radiationKwhM2*coefficients.slope+coefficients.intercept)*(applyLive?model.liveCorrection:1));
  const profile=seasonProfile(date,model.siteKey);
  const upperGuard=Math.max(profile.generation[1]*2,radiationKwhM2*model.installedKwp*1.05);
  return Math.max(0,Math.min(upperGuard,radiationEstimate));
};

export function theoreticalSeries(days:RadiationDay[],model:SolarModel){
  const today=siteDate();
  return days.map(d=>({date:d.date,value:theoreticalDayKwh(d.shortwaveKwhM2,model,d.date===today,d.date)}));
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
