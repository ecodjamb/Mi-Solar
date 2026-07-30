import { Battery, House, PanelsTopLeft, RadioTower, Server } from 'lucide-react';
import type { HistoryRow, Realtime } from '../../types';
import { batteryChargePower,batteryDischargePower,batterySoc,detectPvCount,gridPower,loadPower,pvCurrent,pvPower,pvVoltage,watts } from '../../utils/energy';
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
   {theme==='winter'&&<><path className="smoke" d="M516 174c-24-22 12-34-7-55 31 18 8 38 22 53"/><circle cx="111" cy="409" r="18"/><circle cx="136" cy="404" r="25"/><circle cx="164" cy="410" r="17"/></>}
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
 return <div className="house-scene-wrap">
  <svg className="house-scene" viewBox="0 0 900 500" role="img" aria-label={`Casa en ambiente de ${phase}, ${weather}`}>
   <defs>
    <linearGradient id="skyDay" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#55b8f2"/><stop offset="1" stopColor="#c8ebf9"/></linearGradient>
    <linearGradient id="skyDawn" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ff9a74"/><stop offset=".55" stopColor="#ffd7a5"/><stop offset="1" stopColor="#a7d4dc"/></linearGradient>
    <linearGradient id="skySunset" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#5b5f9c"/><stop offset=".55" stopColor="#f29b6b"/><stop offset="1" stopColor="#9cb6bb"/></linearGradient>
    <linearGradient id="skyNight" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#061629"/><stop offset="1" stopColor="#15385a"/></linearGradient>
    <linearGradient id="lawn" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#4e9d62"/><stop offset="1" stopColor="#1c5137"/></linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
   </defs>
   <rect width="900" height="500" fill={`url(#sky${phase==='day'?'Day':phase==='dawn'?'Dawn':phase==='sunset'?'Sunset':'Night'})`}/>
   {phase==='night'&&<g className="stars">{[70,142,225,337,441,557,675,792,850].map((x,i)=><circle key={x} cx={x} cy={35+(i%3)*34} r={i%2?1.5:2.2}/>)}</g>}
   <g className={`celestial celestial-${phase}`}><circle cx={phase==='dawn'?105:phase==='sunset'?785:phase==='day'?470:760} cy={phase==='dawn'?166:phase==='sunset'?172:phase==='day'?77:86} r={phase==='night'?30:38}/>{phase==='night'&&<text x="760" y="96" textAnchor="middle">{moon.icon}</text>}</g>
   {weather!=='clear'&&weather!=='unknown'&&<g className={`weather-clouds ${weather}`}><g transform="translate(545 78)"><ellipse cx="0" cy="25" rx="72" ry="22"/><circle cx="-38" cy="13" r="29"/><circle cx="10" cy="3" r="39"/><circle cx="51" cy="18" r="27"/></g>{weather==='cloudy'&&<g transform="translate(230 118)"><ellipse cx="0" cy="20" rx="60" ry="18"/><circle cx="-25" cy="10" r="25"/><circle cx="18" cy="5" r="31"/></g>}</g>}
   {(weather==='rain'||weather==='storm')&&<g className="svg-rain">{Array.from({length:18},(_,i)=><line key={i} x1={500+i*20} y1={125+(i%3)*8} x2={490+i*20} y2={158+(i%3)*8}/>)}</g>}
   {weather==='storm'&&<path className="lightning" d="M690 118l-30 46h23l-21 45 60-67h-29l23-24z"/>}
   <path className="mountain far" d="M0 277L125 163l78 70 86-114 99 124 92-93 105 107 89-93 126 113z"/>
   <path className="mountain near" d="M0 315L118 231l87 65 96-94 93 94 101-77 88 73 122-90 195 113z"/>
   <rect y="304" width="900" height="196" fill="url(#lawn)"/>
   <path className="pathway" d="M412 500l35-133h93l40 133z"/>
   <g className="trees"><g transform="translate(70 236)"><rect x="-8" y="78" width="16" height="86"/><circle cy="55" r="55"/><circle cx="-30" cy="70" r="42"/><circle cx="35" cy="72" r="43"/></g><g transform="translate(816 246)"><rect x="-7" y="70" width="14" height="80"/><circle cy="48" r="48"/><circle cx="-28" cy="64" r="36"/><circle cx="30" cy="65" r="38"/></g></g>
   <g className="home-building">
    <path className="house-shadow" d="M276 397h379v14H276z"/>
    <rect className="house-wall" x="309" y="265" width="317" height="142" rx="4"/>
    <rect className="garage" x="515" y="309" width="111" height="98"/>
    <path className="roof-main" d="M278 277l139-116 142 116z"/>
    <path className="roof-right" d="M449 275l83-69 126 70z"/>
    <rect className="chimney" x="502" y="174" width="27" height="69"/>
    <rect className="door" x="426" y="323" width="50" height="84" rx="3"/>
    <g className="house-windows"><rect x="342" y="292" width="55" height="44"/><rect x="342" y="352" width="55" height="42"/><rect x="495" y="271" width="52" height="39"/><rect x="568" y="331" width="39" height="51"/></g>
    <g className="solar-panels"><path d="M337 235l80-66 78 66z"/><path d="M352 226l65-53v53z"/><path d="M421 173l61 53h-61z"/><path d="M373 208h87M396 188v38M438 188v38"/></g>
    {phase==='night'&&<g className="porch-light"><circle cx="450" cy="316" r="7" filter="url(#glow)"/></g>}
    {funMode&&theme==='christmas'&&<g className="xmas-lights">{Array.from({length:14},(_,i)=><circle key={i} cx={312+i*24} cy={277+(i%2)*5} r="4"/>)}</g>}
    {funMode&&theme==='patriotic'&&<g className="flag-house"><path d="M608 280v-71"/><path d="M608 212h62v36h-62z"/><path d="M608 212h24v18h-24z"/></g>}
   </g>
   {funMode&&<SeasonalSVG theme={theme} birthday={birthday}/>} 
   {funMode&&month===11&&<g className="bat"><path d="M732 182q20-18 38 0 18-18 38 0-18-2-20 15-16-15-36 0-2-17-20-15z"/></g>}
  </svg>
  <div className="moon-phase-pill" title={moon.label}><span>{moon.icon}</span><small>{moon.label}</small></div>
 </div>;
}

export default function LivingHome({data,history,weather,funMode=true}:{data:Realtime;history:HistoryRow[];weather:WeatherMood;funMode?:boolean}){
 const p1=pvPower(data,1),p2=pvPower(data,2),total=p1+p2,grid=gridPower(data),load=loadPower(data),charge=batteryChargePower(data),discharge=batteryDischargePower(data),soc=batterySoc(data),count=detectPvCount(data,history);
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
