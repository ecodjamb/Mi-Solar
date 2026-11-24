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
  configurationKey:string;
  configurationEffectiveFrom?:string;
  comparisonUntil?:string;
  calibrationMethod:'robust-seasonal-regression'|'puerto-montt-reference-day';
  referenceDate?:string;
  referenceRadiationKwhM2?:number;
  referenceEnergyKwh?:number;
};

export type SeasonKey='summer'|'autumn'|'winter'|'spring';
export type SeasonProfile={key:SeasonKey;name:string;months:string;generation:[number,number];nightLoad:[number,number];sunHours:[number,number];radiation:[number,number];balance?:[number,number];generationNote?:string;summary:string;battery:string};

export const SEASON_PROFILES:Record<'arrayan'|'puerto-montt',Record<SeasonKey,SeasonProfile>>={
  arrayan:{
    winter:{key:'winter',name:'Invierno',months:'1 jun. – 31 ago.',generation:[16,34],nightLoad:[17,23],sunHours:[9,10],radiation:[2.6,4.2],balance:[-18,-4],generationNote:'Rango operativo de la instalación actual de 10,54 kWp, ajustado para días invernales nublados y despejados.',summary:'El String 2 orientado al norte sostiene el mediodía y el String 1 oeste desplaza parte de la energía hacia la tarde.',battery:'Banco Pylontech UF5000 de 20,48 kWh nominales y 19,456 kWh utilizables: la carga completa depende de varios días favorables.'},
    spring:{key:'spring',name:'Primavera',months:'1 sep. – 30 nov.',generation:[35,62],nightLoad:[12,17],sunHours:[11,13],radiation:[4.7,7.2],balance:[4,29],generationNote:'Rango actualizado para 17 paneles: los días despejados pueden superar ampliamente el valor medio.',summary:'El arreglo norte produce temprano y el arreglo oeste prolonga la curva hacia la tarde.',battery:'Banco UF5000 de 20,48 kWh nominales en paralelo; la carga completa es habitual en días despejados.'},
    summer:{key:'summer',name:'Verano',months:'1 dic. – 28 feb.',generation:[48,72],nightLoad:[10,14],sunHours:[13,14],radiation:[6.8,9.6],balance:[22,48],generationNote:'Rango de alta producción para la configuración vigente; puede haber recorte si las baterías están llenas y no hay consumo.',summary:'La combinación norte + oeste amplía la ventana de producción y aumenta los excedentes aprovechables.',battery:'Banco UF5000 de 20,48 kWh nominales: mayor probabilidad de carga completa y excedente para cargas flexibles.'},
    autumn:{key:'autumn',name:'Otoño',months:'1 mar. – 31 may.',generation:[24,48],nightLoad:[14,20],sunHours:[10,12],radiation:[3.8,6.2],balance:[-2,22],generationNote:'Rango revisado para la potencia instalada actual y la pérdida gradual de horas de luz.',summary:'El String 2 norte sostiene mejor el mediodía y el String 1 oeste desplaza parte de la producción a la tarde.',battery:'Banco UF5000 de 20,48 kWh nominales; la carga completa dependerá de radiación y consumo doméstico.'}
  },
  'puerto-montt':{
    winter:{key:'winter',name:'Invierno',months:'Junio · Julio · Agosto',generation:[6,12],nightLoad:[5,9],sunHours:[8,9],radiation:[2,3],generationNote:'Referencia para 6 paneles JA Solar de 615 W y 3,69 kWp.',summary:'Días cortos, nubosidad y lluvia frecuentes; la referencia se ajusta con el día patrón del 8 de octubre.',battery:'La generación se prioriza para consumo y recuperación mínima de batería.'},
    spring:{key:'spring',name:'Primavera',months:'Septiembre · Octubre · Noviembre',generation:[10,25.7],nightLoad:[5,8],sunHours:[11,13],radiation:[3.5,5],generationNote:'Referencia para 3,69 kWp, calibrada con radiación y producción del 8 de octubre de 2026.',summary:'Aumentan las horas de luz, con alta variabilidad por nubosidad costera.',battery:'Mejora la recuperación diaria, pero se conserva margen para días lluviosos.'},
    summer:{key:'summer',name:'Verano',months:'Diciembre · Enero · Febrero',generation:[14.3,28.6],nightLoad:[4,7],sunHours:[14,16],radiation:[4.5,6],generationNote:'Referencia para 6 paneles JA Solar de 615 W y 3,69 kWp.',summary:'Máxima duración del día; la nubosidad sigue siendo el principal ajuste.',battery:'Mayor probabilidad de carga completa y menor uso del generador.'},
    autumn:{key:'autumn',name:'Otoño',months:'Marzo · Abril · Mayo',generation:[8,17.2],nightLoad:[5,8],sunHours:[10,12],radiation:[3,4.5],generationNote:'Referencia para 6 paneles JA Solar de 615 W y 3,69 kWp.',summary:'La producción disminuye con rapidez y aumenta la dependencia del respaldo.',battery:'Conviene reservar carga para la noche y vigilar varios días consecutivos nublados.'}
  }
};

export const ARRAYAN_CONFIGURATION_EFFECTIVE_FROM='2026-10-01';
export const ARRAYAN_LEGACY_COMPARISON_UNTIL='2027-09-30';
export const ARRAYAN_LEGACY_WP=8680;
export const ARRAYAN_CURRENT_WP=10540;
export const PUERTO_MONTT_CONFIGURATION_EFFECTIVE_FROM='2026-09-18';
export const PUERTO_MONTT_REFERENCE_DAY='2026-10-08';
export const PUERTO_MONTT_LEGACY_WP=1845;
export const PUERTO_MONTT_CURRENT_WP=3690;

export const LEGACY_ARRAYAN_SEASON_PROFILES:Record<SeasonKey,SeasonProfile>={
  winter:{key:'winter',name:'Invierno',months:'Junio · Julio · Agosto',generation:[6.7,6.7],nightLoad:[18,18],sunHours:[10,10],radiation:[3,4],balance:[-36,-36],summary:'Referencia conservada de la configuración anterior de 8,68 kWp.',battery:'Referencia histórica anterior.'},
  spring:{key:'spring',name:'Primavera',months:'Septiembre · Octubre · Noviembre',generation:[16,22],nightLoad:[12,12],sunHours:[11,12],radiation:[5,6],balance:[-27,-21],summary:'Referencia conservada de la configuración anterior de 8,68 kWp.',battery:'Referencia histórica anterior.'},
  summer:{key:'summer',name:'Verano',months:'Diciembre · Enero · Febrero',generation:[30,40],nightLoad:[9,10],sunHours:[14,14],radiation:[8,10],balance:[-13,-3],summary:'Referencia conservada de la configuración anterior de 8,68 kWp.',battery:'Referencia histórica anterior.'},
  autumn:{key:'autumn',name:'Otoño',months:'Marzo · Abril · Mayo',generation:[14,20],nightLoad:[16,16],sunHours:[11,12],radiation:[5,7],balance:[-29,-23],summary:'Referencia conservada de la configuración anterior de 8,68 kWp.',battery:'Referencia histórica anterior.'}
};

export function seasonForDate(date:string):SeasonKey{const month=Number(date.slice(5,7));if(month===12||month<=2)return'summer';if(month<=5)return'autumn';if(month<=8)return'winter';return'spring'}
export const seasonProfile=(date:string,siteKey:'arrayan'|'puerto-montt',configurationKey='')=>configurationKey==='arrayan-v1-8680'?LEGACY_ARRAYAN_SEASON_PROFILES[seasonForDate(date)]:SEASON_PROFILES[siteKey][seasonForDate(date)];

// Perfil inicial de El Arrayán: pérdidas por obstáculos del horizonte, separadas
// del factor meteorológico. Queda centralizado para recalibrarlo con el documento.
const ARRAYAN_SHADE=[0,0,0,0,0,0,.28,.48,.64,.76,.84,.9,.92,.9,.86,.8,.7,.55,.3,.08,0,0,0,0];
const ARRAYAN_NORTH=[0,0,0,0,0,0,.12,.38,.67,.86,.97,1,1,.98,.9,.76,.54,.28,.08,0,0,0,0,0];
const ARRAYAN_WEST=[0,0,0,0,0,0,.03,.12,.3,.52,.7,.83,.92,.99,1,.94,.78,.54,.25,.05,0,0,0,0];
function normalized(values:number[]){const daylight=values.filter(value=>value>0);const average=daylight.reduce((sum,value)=>sum+value,0)/daylight.length;return values.map(value=>value/average)}
function shadeProfile(siteKey:'arrayan'|'puerto-montt',configurationKey=''){
  if(siteKey==='puerto-montt')return Array(24).fill(1);
  if(configurationKey==='arrayan-v2-10540'){
    const combined=ARRAYAN_NORTH.map((north,hour)=>(north*4.96+ARRAYAN_WEST[hour]*5.58)/10.54);
    return normalized(combined);
  }
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

export function isReliableSolarAnalysisDay(day:DailyEnergy,siteKey:'arrayan'|'puerto-montt'){
  if(siteKey!=='arrayan')return true;
  return Number(day.samples||0)>=120&&Number(day.solar||0)>=5&&Number(day.load||0)>=5;
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

export function calibrateSolarModel(actual:DailyEnergy[],radiation:RadiationDay[],installedWp=ARRAYAN_CURRENT_WP, todayActual?:DailyEnergy,siteKey:'arrayan'|'puerto-montt'='arrayan',configurationMode:'current'|'legacy'='current'):SolarModel{
  const byDate=new Map(radiation.map(r=>[r.date,r.shortwaveKwhM2]));
  const today=siteDate();
  const isCurrentArrayan=siteKey==='arrayan'&&configurationMode==='current'&&installedWp>=ARRAYAN_CURRENT_WP;
  const isLegacyArrayan=siteKey==='arrayan'&&configurationMode==='legacy';
  const isCurrentPuertoMontt=siteKey==='puerto-montt'&&configurationMode==='current'&&installedWp>=PUERTO_MONTT_CURRENT_WP;
  const configurationKey=isLegacyArrayan?'arrayan-v1-8680':isCurrentArrayan?'arrayan-v2-10540':isCurrentPuertoMontt?'puerto-montt-v2-3690':`${siteKey}-v1`;
  const completed=actual
    .filter(d=>(d.date<today||(isCurrentPuertoMontt&&d.date===PUERTO_MONTT_REFERENCE_DAY))&&(!isLegacyArrayan||d.date<ARRAYAN_CONFIGURATION_EFFECTIVE_FROM)&&(siteKey!=='arrayan'||isReliableSolarAnalysisDay(d,siteKey))&&d.solar>0.35&&d.samples>=120&&(byDate.get(d.date)||0)>0.5)
    .slice(-60);
  const rawSamples=completed.map(d=>{
    const scale=isCurrentArrayan&&d.date<ARRAYAN_CONFIGURATION_EFFECTIVE_FROM?(ARRAYAN_CURRENT_WP/ARRAYAN_LEGACY_WP)*(.895/.86):isCurrentPuertoMontt&&d.date<PUERTO_MONTT_CONFIGURATION_EFFECTIVE_FROM?PUERTO_MONTT_CURRENT_WP/PUERTO_MONTT_LEGACY_WP:1;
    const adjustedActual=d.solar*scale;
    return{date:d.date,radiation:byDate.get(d.date)||0,actual:adjustedActual,ratio:adjustedActual/((installedWp/1000)*(byDate.get(d.date)||1))};
  }).filter(x=>Number.isFinite(x.ratio)&&x.ratio>0.12&&x.ratio<1.35);
  const puertoReferenceSamples=isCurrentPuertoMontt?rawSamples.filter(item=>item.date===PUERTO_MONTT_REFERENCE_DAY):[];
  const modelSamples=puertoReferenceSamples.length?puertoReferenceSamples:rawSamples;
  const center=median(modelSamples.map(item=>item.ratio));
  const mad=median(modelSamples.map(item=>Math.abs(item.ratio-center)));
  const filteredSamples=modelSamples.filter(item=>Math.abs(item.ratio-center)<=Math.max(.1,mad*3));
  const seasonalSamples=isCurrentPuertoMontt?modelSamples:(filteredSamples.length>=3?filteredSamples:modelSamples);
  let ratios=seasonalSamples.map(item=>item.ratio);
  if(ratios.length>=5){
    const sorted=[...ratios].sort((a,b)=>a-b);
    const trim=Math.floor(sorted.length*.12);
    ratios=sorted.slice(trim,sorted.length-trim||undefined);
  }
  const historicalFactor=ratios.length?median(ratios):0.62;
  const referenceSample=isCurrentPuertoMontt?seasonalSamples.find(item=>item.date===PUERTO_MONTT_REFERENCE_DAY):undefined;
  const regression=referenceSample
    ? {slope:(installedWp/1000)*Math.max(.25,Math.min(1.35,referenceSample.ratio)),intercept:0,rSquared:1}
    : weightedRegression(seasonalSamples,installedWp/1000,today);
  const errors=seasonalSamples.map(sample=>{
    const expected=Math.max(0,regression.slope*sample.radiation+regression.intercept);
    return expected>0?Math.abs(sample.actual-expected)/expected*100:0;
  });
  let liveCorrection=1;
  if(!isLegacyArrayan&&!isCurrentPuertoMontt&&todayActual&&todayActual.solar>0.4){
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
    factor:Math.max(.25,Math.min(isCurrentPuertoMontt?1.35:1.05,historicalFactor)),
    installedKwp:installedWp/1000,
    sampleDays:ratios.length,
    medianErrorPct:median(errors),
    liveCorrection,
    slopeKwhPerRadiation:regression.slope,
    interceptKwh:regression.intercept,
    rSquared:regression.rSquared,
    hourlyShade:shadeProfile(siteKey,configurationKey),
    seasonalSamples,
    siteKey,
    configurationKey,
    configurationEffectiveFrom:isCurrentArrayan?ARRAYAN_CONFIGURATION_EFFECTIVE_FROM:isCurrentPuertoMontt?PUERTO_MONTT_CONFIGURATION_EFFECTIVE_FROM:undefined,
    comparisonUntil:isCurrentArrayan?ARRAYAN_LEGACY_COMPARISON_UNTIL:undefined,
    calibrationMethod:isCurrentPuertoMontt?'puerto-montt-reference-day':'robust-seasonal-regression',
    referenceDate:referenceSample?.date,
    referenceRadiationKwhM2:referenceSample?.radiation,
    referenceEnergyKwh:referenceSample?.actual
  };
}

export function calibrateLegacySolarModel(actual:DailyEnergy[],radiation:RadiationDay[],siteKey:'arrayan'|'puerto-montt'='arrayan'){
  if(siteKey!=='arrayan')return null;
  return calibrateSolarModel(actual,radiation,ARRAYAN_LEGACY_WP,undefined,siteKey,'legacy');
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
  const profile=seasonProfile(date,model.siteKey,model.configurationKey);
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
