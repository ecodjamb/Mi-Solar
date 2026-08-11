import EChart from './EChart';
import type { DailyEnergy } from '../types';
import type { WeatherData } from '../services/weather';
import { projectionCoefficients,seasonForDate,SEASON_PROFILES,theoreticalSeries,theoreticalDayKwh,type SolarModel } from '../utils/solarForecast';

export default function SolarForecastPage({actual,weather,model,siteLabel='El Arrayán',siteKey='arrayan'}:{actual:DailyEnergy[];weather:WeatherData;model:SolarModel;siteLabel?:string;siteKey?:'arrayan'|'puerto-montt'}){
 const radiation=weather.dailyRadiation||[];
 const theoretical=theoreticalSeries(radiation,model);
 const actualMap=new Map(actual.map(d=>[d.date,d.solar]));
 const labels=[...new Set(theoretical.map(x=>x.date))];
 const todayKey=new Date().toLocaleDateString('en-CA',{timeZone:'America/Santiago'});
 const future=theoretical.filter(x=>x.date>todayKey);
 const current=theoretical.find(x=>x.date===todayKey);
 const currentSeason=seasonForDate(todayKey);
 const seasons=Object.values(SEASON_PROFILES[siteKey]);
 const coefficients=projectionCoefficients(todayKey,model);
 const option={
  tooltip:{trigger:'axis',valueFormatter:(v:any)=>v==null?'—':`${Number(v).toFixed(2)} kWh`},
  legend:{textStyle:{color:'#b8c8ce'}},
  grid:{left:55,right:24,top:58,bottom:48},
  xAxis:{type:'category',data:labels.map(d=>new Date(`${d}T12:00`).toLocaleDateString('es-CL',{day:'2-digit',month:'short'})),axisLabel:{color:'#8298a1'},axisLine:{lineStyle:{color:'#29444e'}}},
  yAxis:{type:'value',name:'kWh',nameTextStyle:{color:'#8298a1'},axisLabel:{color:'#8298a1'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},
  series:[
   {name:'Producción real',type:'bar',data:labels.map(d=>actualMap.has(d)?Number(actualMap.get(d)?.toFixed(2)):null),itemStyle:{color:'#4dd58a',borderRadius:[5,5,0,0]}},
   {name:'Modelo estacional por radiación',type:'line',smooth:true,connectNulls:true,data:labels.map(d=>{const r=radiation.find(x=>x.date===d);return r?Number(theoreticalDayKwh(r.shortwaveKwhM2,model,d>=todayKey,d).toFixed(2)):null}),lineStyle:{width:3,type:'dashed',color:'#efbd34'},itemStyle:{color:'#efbd34'}}
  ]
 };
 return <section className="solar-forecast-page">
  <header className="page-heading"><div><small>Radiación y rendimiento · {siteLabel}</small><h1>Histórico y proyección solar</h1><p>El modelo se calibra con días completos respaldados en Mi Solar, la radiación meteorológica local y la estación del año. Aquí se muestra la generación solar bruta; {siteKey==='puerto-montt'?'el aporte efectivo a la casa separa paneles, batería y generador de respaldo.':'el aporte solar efectivo a la casa y los ahorros se calculan aparte usando solamente red activa (statusGrid = 1).'}</p></div><div className="provider-chip">Fuente: {weather.provider||'Sin conexión meteorológica'}</div></header>
  <section className="forecast-kpis">
   <article className="panel stat"><small>Potencia instalada</small><strong>{model.installedKwp.toFixed(2)} kWp</strong></article>
   <article className="panel stat"><small>Factor histórico real</small><strong>{Math.round(model.factor*100)}%</strong><p>{model.sampleDays} días completos usados</p></article>
   <article className="panel stat"><small>Ajuste por rendimiento de hoy</small><strong>{Math.round(model.liveCorrection*100)}%</strong><p>Corrige nubosidad local, orientación y comportamiento real.</p></article>
   <article className="panel stat"><small>Producción prevista hoy</small><strong>{current?`${current.value.toFixed(2)} kWh`:'—'}</strong><p>Modelo ajustado con la producción real del día.</p></article>
   <article className="panel stat"><small>Error histórico mediano</small><strong>{model.sampleDays?`${model.medianErrorPct.toFixed(1)}%`:'—'}</strong></article>
  </section>
  <section className="season-model-grid" aria-label={`Modelo estacional de ${siteLabel}`}>{seasons.map(season=><article className={`panel season-model-card ${season.key===currentSeason?'active':''}`} key={season.key}><small>{season.months}</small><h2>{season.name}</h2><strong>{season.generation[0]===season.generation[1]?season.generation[0].toFixed(1):`${season.generation[0]}–${season.generation[1]}`} kWh/día</strong>{season.generationNote&&<p>{season.generationNote}</p>}<dl><div><dt>Horas de sol</dt><dd>{season.sunHours[0]===season.sunHours[1]?season.sunHours[0]:`${season.sunHours[0]}–${season.sunHours[1]}`} h</dd></div><div><dt>Radiación</dt><dd>{season.radiation[0]}–{season.radiation[1]} kWh/m²/día</dd></div><div><dt>Consumo nocturno</dt><dd>{season.nightLoad[0]===season.nightLoad[1]?season.nightLoad[0]:`${season.nightLoad[0]}–${season.nightLoad[1]}`} kWh</dd></div>{season.balance&&<div><dt>Balance diario referencial</dt><dd>{season.balance[0]===season.balance[1]?season.balance[0]:`${season.balance[0]} a ${season.balance[1]}`} kWh</dd></div>}</dl><p>{season.summary}</p><em>{season.battery}</em>{season.key===currentSeason&&<b>Estación actual</b>}</article>)}</section>
  <section className="panel forecast-chart"><header><div><small>Pasado real y modelo meteorológico estacional</small><h2>Producción diaria: real vs. radiación</h2><p>La proyección pondera con mayor fuerza los días históricos de la misma época del año y mantiene el ajuste horario por sombra.</p></div></header><EChart option={option}/></section>
  <section className="panel projection-formula"><small>Cálculo usado en esta proyección</small><strong>Generación estimada = máx(0; {coefficients.slope.toFixed(2)} × radiación {coefficients.intercept>=0?'+':'−'} {Math.abs(coefficients.intercept).toFixed(2)})</strong><p>Radiación en kWh/m²/día y resultado en kWh/día. Regresión con {model.sampleDays} días reales completos · ajuste R² {coefficients.rSquared.toFixed(2)}. El ajuste de hoy solo se aplica al día en curso, no altera el pronóstico de mañana.</p></section>
  <section className="forecast-days">{future.map(day=><article className="panel" key={day.date}><small>{new Date(`${day.date}T12:00`).toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'})}</small><strong>{day.value.toFixed(2)} kWh</strong><p>Radiación: {radiation.find(r=>r.date===day.date)?.shortwaveKwhM2.toFixed(2)} kWh/m²</p></article>)}</section>
 </section>;
}
