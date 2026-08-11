import { useState } from 'react';
import { Battery, CalendarClock, CheckCircle2, Clock3, PlayCircle, ShieldCheck, Sun, Zap } from 'lucide-react';
import { api } from '../services/api';

type SettingsCheck = {
  observedAt: string;
  readOnly: boolean;
  redischarge: { percent: number | null; command: string | null; status: 'recognized' | 'not-found' };
  output: { mode: 'Utility' | 'SOL' | 'SBU' | null; command: string | null; status: 'recognized' | 'not-found' };
};

type Props = {
  deviceSn: string;
  siteLabel: string;
  currentTime: string;
  tomorrowDate: string;
  tomorrowForecast: number | null;
};

function dateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(year, month - 1, day));
}

export default function ProgrammingPage({ deviceSn, siteLabel, currentTime, tomorrowDate, tomorrowForecast }: Props) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<SettingsCheck | null>(null);
  const [error, setError] = useState('');
  const hasForecast = tomorrowForecast != null;
  const qualifies = hasForecast && tomorrowForecast > 20;
  const redischargeOk = result?.redischarge.percent === 25;
  const outputOk = result?.output.mode === 'SBU';

  async function checkSettings() {
    setChecking(true);
    setError('');
    setResult(null);
    try {
      setResult(await api<SettingsCheck>(`devices/${deviceSn}/settings-check`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible leer la configuración del inversor.');
    } finally {
      setChecking(false);
    }
  }

  return <section className="settings-page">
    <header className="page-heading">
      <div>
        <small>Automatización · {siteLabel}</small>
        <h1>Programación solar</h1>
        <p>Regla diaria basada en la proyección local del día siguiente.</p>
      </div>
    </header>

    <section className="panel programming-alert programming-safe">
      <ShieldCheck />
      <div>
        <strong>Prueba segura de solo lectura</strong>
        <p>Esta etapa únicamente consulta Redischarge y Output. No envía comandos ni cambia el inversor.</p>
      </div>
    </section>

    <section className="panel automation-rule-card">
      <header>
        <div><small>Regla propuesta</small><h2>Día soleado de mañana</h2></div>
        <span className="automation-time"><Clock3 size={17}/> Todos los días · 22:00</span>
      </header>
      <div className="automation-rule-grid">
        <article className="automation-step"><CalendarClock/><span><small>Hoy y hora actual</small><strong>{currentTime} · Chile</strong></span></article>
        <article className="automation-step"><Sun/><span><small>Proyección · {dateLabel(tomorrowDate)}</small><strong>{hasForecast ? `${tomorrowForecast.toFixed(1)} kWh` : 'Pronóstico pendiente'}</strong></span></article>
        <article className={`automation-step automation-condition ${hasForecast ? (qualifies ? 'pass' : 'fail') : 'pending'}`}><CheckCircle2/><span><small>Condición</small><strong>{hasForecast ? (qualifies ? 'Sí supera 20 kWh' : 'No supera 20 kWh') : 'Esperando radiación'}</strong></span></article>
      </div>
      <div className="automation-targets">
        <span><Battery/><small>Objetivo Redischarge</small><strong>25%</strong></span>
        <span><Zap/><small>Objetivo Output</small><strong>SBU</strong></span>
      </div>
      <p className="automation-explanation">A las 22:00, si la generación proyectada para mañana supera 20 kWh, la regla comprobaría ambos valores y solo propondría modificar los que sean distintos.</p>
    </section>

    <section className="panel settings-test-card">
      <header>
        <div><small>Equipo seleccionado</small><h2>{siteLabel}</h2></div>
        <span className="read-only-badge">Solo lectura</span>
      </header>
      <button className="primary-action settings-test-button" type="button" disabled={checking || !deviceSn} onClick={checkSettings}>
        <PlayCircle/>{checking ? 'Consultando inversor…' : 'Probar lectura sin cambiar nada'}
      </button>
      {error && <p className="settings-test-error" role="alert">{error}</p>}
      {result && <>
        <div className="settings-result-grid" aria-live="polite">
          <article className={redischargeOk ? 'setting-ok' : 'setting-review'}>
            <small>Redischarge actual</small>
            <strong>{result.redischarge.percent == null ? 'No identificado' : `${result.redischarge.percent}%`}</strong>
            <span>{result.redischarge.percent == null ? 'La respuesta no incluyó un valor reconocible.' : redischargeOk ? 'Ya coincide con el objetivo.' : 'Se propondría cambiar a 25%.'}</span>
          </article>
          <article className={outputOk ? 'setting-ok' : 'setting-review'}>
            <small>Output actual</small>
            <strong>{result.output.mode || 'No identificado'}</strong>
            <span>{result.output.mode == null ? 'La respuesta no incluyó un modo reconocible.' : outputOk ? 'Ya está configurado en SBU.' : 'Se propondría cambiar a SBU.'}</span>
          </article>
        </div>
        <p className="settings-test-summary">
          {qualifies
            ? (redischargeOk && outputOk ? 'Resultado: mañana califica y no sería necesario cambiar parámetros.' : 'Resultado: mañana califica; la regla propondría ajustar únicamente los valores indicados.')
            : 'Resultado: la regla no ejecutaría cambios porque la proyección de mañana no supera 20 kWh.'}
          {' '}Lectura: {new Date(result.observedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}.
        </p>
      </>}
    </section>

    <button className="automation-enable" type="button" disabled>
      Activación automática pendiente de aprobar esta prueba
    </button>
  </section>;
}
