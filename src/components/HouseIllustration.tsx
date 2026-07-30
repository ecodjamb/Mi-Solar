import { birthdayMessage,birthdayToday,chileParts,dayPhase,moonPhase,seasonalTheme,weatherCodeToMood } from '../utils/living';
import type { WeatherData } from '../services/weather';

function monthDecoration(theme:string){
  if(theme==='summer')return {icon:'🏖️',label:'Vacaciones de verano'};
  if(theme==='school')return {icon:'🎒',label:'Vuelta a clases'};
  if(theme==='mateo-month')return {icon:'🏍️',label:'Mes de Mateo'};
  if(theme==='vichi-month')return {icon:'🏀',label:'Mes de Vichi'};
  if(theme==='winter')return {icon:'🔥',label:'Invierno en casa'};
  if(theme==='caro-month')return {icon:'🎈',label:'Mes de Caro'};
  if(theme==='patriotic')return {icon:'🇨🇱',label:'Fiestas Patrias'};
  if(theme==='tomas-month')return {icon:'⚽',label:'Mes de Tomás'};
  if(theme==='halloween')return {icon:'🎃',label:'Halloween'};
  if(theme==='christmas')return {icon:'🎄',label:'Navidad'};
  return {icon:'🌿',label:'Tu casa hoy'};
}

export default function HouseIllustration({weather,funMode=true}:{weather:WeatherData;funMode?:boolean}){
  const phase=dayPhase();
  const scene=phase==='dawn'?'dawn':phase==='sunset'?'sunset':phase==='night'?'night':'day';
  const mood=weatherCodeToMood(weather.weatherCode);
  const moon=moonPhase();
  const theme=seasonalTheme();
  const birthday=birthdayToday();
  const decoration=monthDecoration(theme);
  const {month}=chileParts();
  return <section className="panel house-illustration-card">
    <header className="section-head"><div><small>Tu hogar hoy</small><h2>Casa viva</h2></div><span className="status-dot">{phase==='night'?moon.label:mood==='rain'?'Lluvia':mood==='cloudy'?'Nublado':mood==='partly-cloudy'?'Parcialmente nublado':phase==='dawn'?'Amanecer':phase==='sunset'?'Atardecer':'Día'}</span></header>
    <div className={`house-illustration scene-${scene} weather-${mood}`}>
      <img src={`/scenes/home-${scene}.webp`} alt="Casa familiar en la montaña"/>
      {(mood==='partly-cloudy'||mood==='cloudy'||mood==='rain'||mood==='storm')&&<div className="hi-clouds"><i/><i/><i/></div>}
      {(mood==='rain'||mood==='storm')&&<div className="hi-rain">{Array.from({length:26},(_,i)=><i key={i}/>)}</div>}
      {mood==='storm'&&<div className="hi-lightning">ϟ</div>}
      {phase==='night'&&<div className="hi-moon" title={moon.label}>{moon.icon}</div>}
      {(month>=5&&month<=9)&&<div className="hi-smoke"><i/><i/><i/><i/></div>}
      {funMode&&<div className={`hi-season hi-${theme}`} title={decoration.label}><span>{decoration.icon}</span></div>}
      {birthday&&funMode&&<div className="hi-birthday">🎉 {birthdayMessage(birthday)}</div>}
      <div className="hi-weather-caption"><strong>{weather.temperature!=null?`${weather.temperature.toFixed(1)} °C`:'Clima local'}</strong><span>{weather.provider||'Hora local de Santiago'}</span></div>
    </div>
  </section>;
}
