import type { RadiationHour, WeatherData } from '../services/weather';

function dayPosition(value?: string) {
  const match = String(value || '').match(/(?:T|^)(\d{2}):(\d{2})/);
  if (!match) return null;
  return Math.max(0, Math.min(100, ((Number(match[1]) * 60 + Number(match[2])) / 1440) * 100));
}

function clockLabel(value?: string) {
  return String(value || '').match(/(?:T|^)(\d{2}:\d{2})/)?.[1] || '—';
}

function hourVisual(hour: RadiationHour) {
  const code = Number(hour.weatherCode || 0);
  const raining = Number(hour.precipitation || 0) > 0.1 || (code >= 51 && code <= 99);
  const daylight = hour.isDay == null ? Number(hour.shortwaveWm2 || 0) > 0 : Number(hour.isDay) === 1;
  if (raining) return { icon: '🌧️', className: 'weather-rain', label: 'lluvia' };
  if (!daylight && (Number(hour.cloudCover || 0) >= 30 || [1, 2, 3, 45, 48].includes(code))) return { icon: '☁️', className: 'weather-cloud', label: 'nubes durante la noche' };
  if (!daylight) return { icon: '🌙', className: 'weather-night', label: 'noche despejada' };
  if (Number(hour.cloudCover || 0) >= 65 || [3, 45, 48].includes(code)) return { icon: '☁️', className: 'weather-cloud', label: 'nublado' };
  if (Number(hour.cloudCover || 0) >= 30 || code === 1 || code === 2) return { icon: '🌤️', className: 'weather-mixed', label: 'sol y nubes' };
  return { icon: '☀️', className: 'weather-sun', label: 'soleado' };
}

export default function HomeWeatherTimeline({ weather, date, clock }: { weather: WeatherData; date: string; clock: string }) {
  const available = (weather.hourly || []).filter((hour) => hour.time.startsWith(date));
  const byHour = new Map(available.map((hour) => [Number(hour.time.slice(11, 13)), hour]));
  const slots = Array.from({ length: 24 }, (_, hour) => byHour.get(hour));
  const hours = slots.filter((hour): hour is RadiationHour => Boolean(hour));
  const day = (weather.dailyRadiation || []).find((item) => item.date === date);
  const rainMm = day?.precipitationSumMm ?? hours.reduce((sum, hour) => sum + Number(hour.precipitation || 0), 0);
  const temperatures=hours.map(hour=>Number(hour.temperature)).filter(Number.isFinite);
  const winds=hours.map(hour=>Number(hour.windSpeed)).filter(Number.isFinite);
  const clouds=hours.map(hour=>Number(hour.cloudCover)).filter(Number.isFinite);
  const minTemperature=temperatures.length?Math.min(...temperatures):null;
  const maxTemperature=temperatures.length?Math.max(...temperatures):null;
  const maxWind=winds.length?Math.max(...winds):(Number.isFinite(Number(weather.windSpeed))?Number(weather.windSpeed):null);
  const averageClouds=clouds.length?clouds.reduce((sum,value)=>sum+value,0)/clouds.length:null;
  const sunrisePosition = dayPosition(day?.sunrise || weather.sunrise);
  const sunsetPosition = dayPosition(day?.sunset || weather.sunset);
  const nowPosition = dayPosition(clock);

  if (!hours.length) return null;

  return <section className="panel home-weather-timeline" aria-label={`Clima de hoy, ${date}`}>
    <header><span><small>Clima de hoy</small><strong>Así avanza el día</strong></span><b>{weather.temperature==null?'Pronóstico diario':`${weather.temperature.toFixed(1)} °C ahora`}</b></header>
    <div className="home-weather-metrics" aria-label="Resumen meteorológico de hoy">
      <span><small>Mínima</small><strong>{minTemperature==null?'—':`${minTemperature.toFixed(1)} °C`}</strong></span>
      <span><small>Máxima</small><strong>{maxTemperature==null?'—':`${maxTemperature.toFixed(1)} °C`}</strong></span>
      <span><small>Viento máximo</small><strong>{maxWind==null?'—':`${maxWind.toFixed(0)} km/h`}</strong></span>
      <span><small>Precipitación</small><strong>{rainMm.toFixed(1)} mm</strong></span>
      <span><small>Nubosidad media</small><strong>{averageClouds==null?'—':`${averageClouds.toFixed(0)}%`}</strong></span>
      <span><small>Humedad actual</small><strong>{weather.humidity==null?'—':`${weather.humidity.toFixed(0)}%`}</strong></span>
    </div>
    <div className="home-weather-track-wrap">
      {nowPosition == null ? null : <span className="home-weather-now" style={{ left: `${nowPosition}%` }} aria-label={`Ahora, ${clock.slice(0, 5)}`}><b>Ahora</b><i aria-hidden="true">▼</i></span>}
      <div className="home-weather-strip" role="list">{slots.map((hour, index) => {
        if (!hour) return <span className="weather-missing" role="listitem" aria-label={`${String(index).padStart(2, '0')}:00 sin pronóstico`} key={`${date}-${index}`} />;
        const visual = hourVisual(hour);
        const hourLabel = hour.time.slice(11, 16);
        const description = `${hourLabel}: ${visual.label}, ${Number(hour.precipitation || 0).toFixed(1)} mm`;
        return <span className={visual.className} role="listitem" aria-label={description} title={description} key={hour.time}><b aria-hidden="true">{visual.icon}</b></span>;
      })}</div>
    </div>
    <div className="home-weather-axis" aria-hidden="true">{[0, 6, 12, 18, 24].map((hour) => <time key={hour} style={{ left: `${(hour / 24) * 100}%` }}>{String(hour).padStart(2, '0')}</time>)}</div>
    <div className="home-weather-sun-times">
      {sunrisePosition == null ? null : <span className="sunrise" style={{ left: `${sunrisePosition}%` }}><b aria-hidden="true">🌅</b><time>{clockLabel(day?.sunrise || weather.sunrise)}</time></span>}
      {sunsetPosition == null ? null : <span className="sunset" style={{ left: `${sunsetPosition}%` }}><b aria-hidden="true">🌇</b><time>{clockLabel(day?.sunset || weather.sunset)}</time></span>}
    </div>
  </section>;
}
