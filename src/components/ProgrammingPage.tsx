import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, CloudSun, Clock3, PlayCircle, ShieldCheck, Sun } from 'lucide-react';
import { api } from '../services/api';

type InverterSettings = {
  redischarge: { percent: number | null; command: string | null; status: 'recognized' | 'not-found' };
  output: { mode: 'Utility' | 'SOL' | 'SBU' | null; command: string | null; status: 'recognized' | 'not-found' };
};

type SettingsCheck = InverterSettings & { observedAt: string; readOnly: boolean };
type Preset = 'sunny' | 'cloudy';
type AutomationRule = {
  enabled: boolean;
  executionMode: 'manual' | 'automatic';
  thresholdKwh: number;
  runAtLocal: string;
  sunny: { redischarge: number; output: string };
  cloudy: { redischarge: number; output: string };
  updatedAt: string | null;
  configured: boolean;
};
type ApplyResponse = {
  confirmed: boolean;
  preset: Preset;
  before: InverterSettings;
  target: { redischarge: number; output: string };
  after: InverterSettings;
  audit: { stored: boolean; id?: number | null };
  message: string;
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
  const [automation, setAutomation] = useState<AutomationRule | null>(null);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [applying, setApplying] = useState<Preset | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState('');
  const hasForecast = tomorrowForecast != null;
  const qualifies = hasForecast && tomorrowForecast > 20;

  useEffect(() => {
    let active = true;
    setAutomation(null);
    if (!deviceSn) return () => { active = false; };
    api<AutomationRule>(`devices/${deviceSn}/automation`)
      .then(value => active && setAutomation(value))
      .catch(cause => active && setError(cause instanceof Error ? cause.message : 'No se pudo cargar la automatización.'));
    return () => { active = false; };
  }, [deviceSn]);

  async function checkSettings() {
    setChecking(true);
    setError('');
    setActionMessage('');
    try {
      setResult(await api<SettingsCheck>(`devices/${deviceSn}/settings-check`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible leer la configuración del inversor.');
    } finally {
      setChecking(false);
    }
  }

  async function applyPreset(preset: Preset) {
    const target = preset === 'sunny' ? 'Redischarge 25% y Output SBU' : 'Redischarge 50% y Output SOL';
    if (!window.confirm(`Se modificará ${siteLabel} a ${target}. ¿Confirmas el cambio manual?`)) return;
    setApplying(preset);
    setError('');
    setActionMessage('');
    try {
      const response = await api<ApplyResponse>(`devices/${deviceSn}/settings-apply`, {
        method: 'POST',
        body: JSON.stringify({ preset, forecastDate: tomorrowDate, forecastKwh: tomorrowForecast })
      });
      setResult({ ...response.after, observedAt: new Date().toISOString(), readOnly: false });
      setActionMessage(`${response.message}${response.audit.stored ? ' El cambio quedó respaldado en Mi Solar.' : ' El inversor confirmó el cambio, pero falta confirmar el respaldo.'}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible aplicar la configuración.');
    } finally {
      setApplying(null);
    }
  }

  async function toggleAutomation() {
    if (!automation) return;
    setSavingAutomation(true);
    setError('');
    try {
      const next = await api<AutomationRule>(`devices/${deviceSn}/automation`, { method: 'PUT', body: JSON.stringify({ enabled: !automation.enabled }) });
      setAutomation(next);
      setActionMessage(`Automatización ${next.enabled ? 'activada' : 'desactivada'} y guardada en Mi Solar. Por ahora los cambios de configuración siguen siendo manuales.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el estado de automatización.');
    } finally {
      setSavingAutomation(false);
    }
  }

  return <section className="settings-page">
    <header className="page-heading"><div><small>Automatización · {siteLabel}</small><h1>Programación solar</h1><p>La decisión utiliza exactamente la proyección recalibrada de la sección Radiación.</p></div></header>

    <section className="panel programming-alert programming-safe"><ShieldCheck/><div><strong>Control manual con verificación</strong><p>Cada botón lee el estado anterior, cambia únicamente los valores necesarios, vuelve a leer el inversor y registra el resultado en la base permanente.</p></div></section>

    <section className="panel automation-rule-card">
      <header><div><small>Pronóstico de mañana</small><h2>{dateLabel(tomorrowDate)}</h2></div><span className="automation-time"><Clock3 size={17}/> Evaluación · 22:00</span></header>
      <div className="automation-rule-grid">
        <article className="automation-step"><CalendarClock/><span><small>Hora actual</small><strong>{currentTime} · Chile</strong></span></article>
        <article className="automation-step"><Sun/><span><small>Generación estimada</small><strong>{hasForecast ? `${tomorrowForecast.toFixed(1)} kWh` : 'Pronóstico pendiente'}</strong></span></article>
        <article className={`automation-step automation-condition ${hasForecast ? (qualifies ? 'pass' : 'fail') : 'pending'}`}><CheckCircle2/><span><small>Recomendación</small><strong>{hasForecast ? (qualifies ? 'Mañana día de sol' : 'Mañana día nublado') : 'Esperando radiación'}</strong></span></article>
      </div>
    </section>

    <section className="programming-presets" aria-label="Configuraciones manuales">
      <button className={`panel preset-button preset-sunny ${qualifies ? 'recommended' : ''}`} type="button" disabled={Boolean(applying)} onClick={() => applyPreset('sunny')}>
        <span className="preset-icon"><Sun/></span><span><small>{qualifies ? 'Recomendado por la proyección' : 'Configuración alternativa'}</small><strong>Mañana día de sol</strong><em>Redischarge 25% · Output SBU</em></span><b>{applying === 'sunny' ? 'Aplicando…' : 'Aplicar'}</b>
      </button>
      <button className={`panel preset-button preset-cloudy ${hasForecast && !qualifies ? 'recommended' : ''}`} type="button" disabled={Boolean(applying)} onClick={() => applyPreset('cloudy')}>
        <span className="preset-icon"><CloudSun/></span><span><small>{hasForecast && !qualifies ? 'Recomendado por la proyección' : 'Configuración alternativa'}</small><strong>Mañana día nublado</strong><em>Redischarge 50% · Output SOL</em></span><b>{applying === 'cloudy' ? 'Aplicando…' : 'Aplicar'}</b>
      </button>
    </section>

    <section className="panel settings-test-card">
      <header><div><small>Equipo seleccionado</small><h2>{siteLabel}</h2></div><span className="read-only-badge">Comprobación</span></header>
      <button className="primary-action settings-test-button" type="button" disabled={checking || !deviceSn || Boolean(applying)} onClick={checkSettings}><PlayCircle/>{checking ? 'Consultando inversor…' : 'Leer configuración actual'}</button>
      {error ? <p className="settings-test-error" role="alert">{error}</p> : null}
      {actionMessage ? <p className="settings-action-success" role="status">{actionMessage}</p> : null}
      {result ? <div className="settings-result-grid" aria-live="polite">
        <article><small>Redischarge actual</small><strong>{result.redischarge.percent == null ? 'No identificado' : `${result.redischarge.percent}%`}</strong></article>
        <article><small>Output actual</small><strong>{result.output.mode || 'No identificado'}</strong></article>
      </div> : null}
    </section>

    <section className="panel automation-switch-card">
      <div><small>Estado persistente</small><h2>Automatizar</h2><p>El interruptor queda guardado por equipo. Durante esta etapa los botones soleado y nublado continúan siendo manuales.</p></div>
      <button className={`automation-switch ${automation?.enabled ? 'on' : ''}`} type="button" role="switch" aria-checked={Boolean(automation?.enabled)} disabled={!automation || savingAutomation} onClick={toggleAutomation}>
        <span/><strong>{savingAutomation ? 'Guardando…' : automation?.enabled ? 'Activada' : 'Desactivada'}</strong>
      </button>
    </section>
  </section>;
}
