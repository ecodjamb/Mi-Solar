import type { RadiationHour, WeatherData } from '../services/weather';

const SITE_TZ='America/Santiago';

function condition(code?:number){
  if(code==null)return 'Sin pronóstico';
  if(code>=95)return 'Tormentas';
  if(code>=71)return 'Nieve';
  if(code>=51)return 'Lluvia';
  if(code>=45)return 'Niebla';
  if(code>=2)return 'Parcialmente nublado';
  return 'Despejado';
}

function chileDate(value=new Date()){
  return value.toLocaleDateString('en-CA',{timeZone:SITE_TZ});
}

function addDay(date:string){
  const [year,month,day]=date.split('-').map(Number);
  return new Date(Date.UTC(year,month-1,day+1)).toISOString().slice(0,10);
}

function temperatureRange(hours:RadiationHour[]){
  const values=hours.map(hour=>Number(hour.temperature)).filter(Number.isFinite);
  return values.length?{min:Math.min(...values),max:Math.max(...values)}:null;
}

function rainSum(hours:RadiationHour[]){
  return hours.reduce((sum,hour)=>sum+Math.max(0,Number(hour.precipitation||0)),0);
}

function weatherDayLabel(date:string){
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-CL',{timeZone:SITE_TZ,weekday:'long',day:'numeric',month:'long'});
}

export default function WeatherOutlook({weather,locationLabel}:{weather:WeatherData;locationLabel:string}){
  const hours=weather.hourly||[];
  const todayDate=chileDate();
  const tomorrowDate=addDay(todayDate);
  const nowHour=(weather.updatedAt?.slice(0,13)||`${todayDate}T${new Date().toLocaleTimeString('en-GB',{timeZone:SITE_TZ,hour:'2-digit',hourCycle:'h23'})}`).slice(0,13);
  const todayHours=hours.filter(hour=>hour.time.slice(0,10)===todayDate);
  const tomorrowHours=hours.filter(hour=>hour.time.slice(0,10)===tomorrowDate);
  const next24=hours.filter(hour=>hour.time.slice(0,13)>=nowHour).slice(0,24);
  const todayRange=temperatureRange(todayHours);
  const tomorrowRange=temperatureRange(tomorrowHours);
  const rainToday=rainSum(todayHours.filter(hour=>hour.time.slice(0,13)<=nowHour));
  const rainNext24=rainSum(next24);
  const rainTomorrow=rainSum(tomorrowHours);
  const tomorrowCode=tomorrowHours.find(hour=>Number(hour.precipitation||0)>0.1)?.weatherCode??tomorrowHours[Math.floor(tomorrowHours.length/2)]?.weatherCode;

  return <section className={`panel weather-card ${weather.error?'weather-warning':''}`}>
    <small>Condición actual · {weather.provider||'sin proveedor'}</small>
    <span className="weather-location">{locationLabel}</span>
    <strong>{weather.temperature!=null?`${weather.temperature.toFixed(1)} °C`:'Sin dato climático'}</strong>
    <p>{weather.humidity!=null?`${condition(weather.weatherCode)} · Humedad ${weather.humidity}% · Nubes ${Number(weather.cloudCover||0).toFixed(0)}% · Viento ${Number(weather.windSpeed||0).toFixed(0)} km/h`:'No llegó información meteorológica.'}</p>
    <div className="weather-metrics">
      <span><small>Mín. / máx. de hoy</small><b>{todayRange?`${todayRange.min.toFixed(1)}° / ${todayRange.max.toFixed(1)}°`:'—'}</b></span>
      <span><small>Lluvia desde las 00:00</small><b>{rainToday.toFixed(1)} mm</b></span>
      <span><small>Lluvia próximas 24 h</small><b>{rainNext24.toFixed(1)} mm</b></span>
    </div>
    <div className="weather-tomorrow"><h4>Pronóstico de mañana · {weatherDayLabel(tomorrowDate)}</h4><p><b>{condition(tomorrowCode)}</b> · {tomorrowRange?`${tomorrowRange.min.toFixed(1)} °C mín. / ${tomorrowRange.max.toFixed(1)} °C máx.`:'temperaturas pendientes'} · lluvia {rainTomorrow.toFixed(1)} mm.</p></div>
    {weather.updatedAt&&<small>Actualizado: {new Date(weather.updatedAt).toLocaleString('es-CL',{timeZone:SITE_TZ})}</small>}{weather.error&&<small className="error-text">{weather.error}</small>}
  </section>;
}
