import { Battery, House, PanelsTopLeft, RadioTower, Server } from 'lucide-react';
import type { HistoryRow, Realtime } from '../../types';
import { batteryChargePower,batteryDischargePower,batterySoc,detectPvCount,effectiveGridPower,loadPower,pvCurrent,pvPower,pvVoltage,watts } from '../../utils/energy';
import { birthdayMessage,birthdayToday,chileParts,dayPhase,moonPhase,panelMood,seasonalTheme,type WeatherMood } from '../../utils/living';

function FlowCard({className,title,value,sub,icon:Icon}:{className:string;title:string;value:string;sub:string;icon:any}){
 return <article className={`living-card ${className}`}><Icon size={27}/><div><small>{title}</small><strong>{value}</strong><em>{sub}</em></div></article>;
}

function SeasonalSVG({theme,birthday}:{theme:string;birthday:string|null}){
 return <g className={`scene-season season-${theme}`}>
   {theme==='summer'&&<><g className="beach-decor"><path d="M90 411 q38-65 76 0"/><path d="M128 347v68"/><rect x="69" y="405" width="118" height="8" rx="4"/></g><circle cx="204" cy="397" r="13"/></>}
   {theme==='school'&&<><rect x="95" y="374" width="38" height="47" rx="8"/><path d="M101 374q12-22 26 0"/><path d="M143 407l34-20m-28 27l34-20"/></>}
   {theme==='mateo-month'&&<g className="motorbike"><circle cx="105" cy="413" r="17"/><circle cx="174" cy="413" r="17"/><path d="M105 413l24-34 30 34h-54l32-16 17-26"/></g>}
   {theme==='vichi-month'&&<><circle cx="116" cy="402" r="24" className="basketball"/><path d="M93 402h46M116 378c-10 12-10 36 0 48M116 378c10 12 10 36 0 48"/></>}
   {theme==='winter'&&<><circle cx="111" cy="409" r="18"/><circle cx="136" cy="404" r="25"/><circle cx="164" cy="410" r="17"/></>}
   {theme==='caro-month'&&<><circle cx="100" cy="372" r="15"/><circle cx="132" cy="356" r="17"/><circle cx="164" cy="376" r="15"/><path d="M100 387l24 35m8-49l-7 49m39-31l-38 31"/></>}
   {theme==='patriotic'&&<><path d="M85 347v78"/><path d="M87 351h64v38H87z"/><path d="M87 351h25v19H87z"/><path d="M112 351h39v19h-39z"/><path d="M87 370h64v19H87z"/><path className="kite" d="M188 351l25 22-25 22-25-22z"/><path d="M188 395q-16 18 3 31"/></>}
   {theme==='tomas-month'&&<><circle cx="124" cy="402" r="25" className="football"/><path d="M124 377l12 9-5 15h-15l-5-15zm-13 9l-14 4m34-4l15 4m-30 11l-8 17m23-17l8 17"/></>}
   {theme==='halloween'&&<><path className="pumpkin" d="M85 400q0-39 39-39t39 39q0 30-39 30t-39-30z"/><path d="M124 361v-17m-22 42l12 9-14 10m46-19l-12 9 14 10m-33 7h20"/></>}
   {theme==='christmas'&&<><path className="tree" d="M116 334l-39 57h25l-33 44h94l-33-44h25z"/><rect x="111" y="435" width="12" height="20"/><g className="lights"><circle cx="108" cy="370" r="4"/><circle cx="130" cy="389" r="4"/><circle cx="101" cy="410" r="4"/><circle cx="141" cy="422" r="4"/></g></>}
   {birthday&&<g className="birthday-special"><circle cx="716" cy="341" r="18"/><circle cx="748" cy="328" r="20"/><circle cx="780" cy="345" r="18"/><path d="M716 359l28 52m4-63l-2 63m34-48l-33 48"/><rect x="718" y="408" width="65" height="30" rx="8"/><path d="M727 408v-12m17 12v-12m17 12v-12"/></g>}
 </g>;
}

function HouseScene({phase,weather,theme,birthday,funMode}:{phase:string;weather:WeatherMood;theme:string;birthday:string|null;funMode:boolean}){
 const moon=moonPhase(); const {month}=chileParts();
 const scenePhase=phase==='dawn'?'dawn':phase==='sunset'?'sunset':phase==='night'?'night':'day';
 return <div className={`house-scene-wrap raster-scene phase-${scenePhase} weather-${weather}`}>
  <img className="house-raster" src={`/scenes/home-${scenePhase}.webp`} alt={`Casa moderna en ambiente de ${scenePhase}`}/>
  {weather!=='clear'&&weather!=='unknown'&&<div className={`raster-clouds raster-clouds-${weather}`}><i/><i/><i/></div>}
  {(weather==='rain'||weather==='storm')&&<div className="raster-rain">{Array.from({length:34},(_,i)=><i key={i}/>)}</div>}
  {weather==='storm'&&<div className="raster-lightning">ϟ</div>}
  {phase==='night'&&<div className="raster-moon" title={moon.label}>{moon.icon}</div>}
  <div className="chimney-smoke" aria-hidden="true"><i/><i/><i/><i/></div>
  {funMode&&<svg className="seasonal-raster-overlay" viewBox="0 0 900 500" aria-hidden="true"><SeasonalSVG theme={theme} birthday={birthday}/>{month===11&&<g className="bat"><path d="M732 182q20-18 38 0 18-18 38 0-18-2-20 15-16-15-36 0-2-17-20-15z"/></g>}</svg>}
  <div className="moon-phase-pill" title={moon.label}><span>{moon.icon}</span><small>{moon.label}</small></div>
 </div>;
}

export default function LivingHome({data,history,weather,funMode=true}:{data:Realtime;history:HistoryRow[];weather:WeatherMood;funMode?:boolean}){
 const p1=pvPower(data,1),p2=pvPower(data,2),total=p1+p2,grid=effectiveGridPower(data),load=loadPower(data),charge=batteryChargePower(data),discharge=batteryDischargePower(data),soc=batterySoc(data),count=detectPvCount(data,history);
 const phase=dayPhase(),theme=seasonalTheme(),birthday=birthdayToday(),isDay=phase!=='night';
 const nominalTotal=Number(localStorage.getItem('installedWp'))||8680;
 const share1=nominalTotal?Math.max(0,p1/(nominalTotal/Math.max(1,count))*100):0;
 const share2=nominalTotal?Math.max(0,p2/(nominalTotal/Math.max(1,count))*100):0;
 const mood1=panelMood(share1,isDay),mood2=panelMood(share2,isDay);
 return <section className="panel living-panel"><header className="section-head"><div><small>Tu hogar en tiempo real</small><h2>Flujo de energía</h2></div><span className="status-dot">{phase==='night'?'Noche':phase==='dawn'?'Amaneciendo':phase==='sunset'?'Atardeciendo':'Día'}</span></header>
  <div className={`living-stage living-stage-v2 phase-${phase} weather-${weather} theme-${funMode?theme:'neutral'}`}>
   <HouseScene phase={phase} weather={weather} theme={theme} birthday={birthday} funMode={funMode}/>
   <div className="pv-cards pv-cards-v2">
    <article className="pv-living-card"><PanelsTopLeft/><div><small>{count===2?'PV1 · MPPT 1':'Paneles'}</small><strong>{watts(p1)}</strong><em>{pvVoltage(data,1).toFixed(0)} V · {pvCurrent(data,1).toFixed(1)} A</em></div>{funMode&&<b title={mood1.label}>{mood1.icon}</b>}</article>
    {count===2&&<article className="pv-living-card"><PanelsTopLeft/><div><small>PV2 · MPPT 2</small><strong>{watts(p2)}</strong><em>{pvVoltage(data,2).toFixed(0)} V · {pvCurrent(data,2).toFixed(1)} A</em></div>{funMode&&<b title={mood2.label}>{mood2.icon}</b>}</article>}
    <article className="total-solar-living"><small>{count===2?'Total solar · PV1 + PV2':'Total solar'}</small><strong>{watts(total)}</strong>{count===2&&<span>PV1 {total?Math.round(p1/total*100):0}% · PV2 {total?Math.round(p2/total*100):0}%</span>}</article>
   </div>
   <FlowCard className="grid-live" title="Red" value={watts(Math.abs(grid))} sub={grid<0?'Exportando':'Importando'} icon={RadioTower}/>
   <FlowCard className="battery-live" title={`Batería · ${soc.toFixed(0)}%`} value={watts(Math.max(charge,discharge))} sub={charge>discharge?'Cargando':'Entregando'} icon={Battery}/>
   <FlowCard className="inverter-live" title="Inversor" value={watts(Math.max(load,total+Math.max(grid,0)+discharge))} sub="Operando" icon={Server}/>
   <FlowCard className="load-live" title="Consumo casa" value={watts(load)} sub="Ahora" icon={House}/>
   <svg className="living-lines" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
    <path className={`energy-line solar-path ${total>5?'active':''}`} d="M 245 145 C 360 145 390 225 500 225"/>
    <path className={`energy-line grid-path ${Math.abs(grid)>5?'active':''} ${grid<0?'reverse':''}`} d="M 220 435 C 355 435 395 345 500 345"/>
    <path className={`energy-line battery-path ${Math.max(charge,discharge)>5?'active':''} ${charge>discharge?'reverse':''}`} d="M 780 435 C 650 435 620 345 545 345"/>
    <path className={`energy-line home-path ${load>5?'active':''}`} d="M 520 370 C 520 430 520 470 520 530"/>
   </svg>
   {birthday&&funMode&&<div className="birthday-banner">{birthdayMessage(birthday)}</div>}
  </div>
 </section>;
}
