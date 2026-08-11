import { useEffect, useState } from 'react';
import { BellRing, CalendarClock, CheckCircle2, ChevronDown, CloudSun, Clock3, KeyRound, Minus, PlayCircle, Plus, Save, Settings2, ShieldCheck, Sun } from 'lucide-react';
import { api } from '../services/api';

type InverterSettings = {
  redischarge: { percent: number | null; command: string | null; status: 'recognized' | 'not-found' };
  output: { mode: 'Utility' | 'SOL' | 'SBU' | null; command: string | null; status: 'recognized' | 'not-found' };
};
type SettingsCheck = InverterSettings & { observedAt: string; readOnly: boolean };
type Preset = 'sunny' | 'cloudy';
type ProfileConfig = { redischarge: number; output: 'Utility' | 'SOL' | 'SBU' };
type LastExecution = { forecast_date: string; evaluated_at: string; forecast_kwh: number; preset: Preset; action: 'changed' | 'unchanged' | 'failed'; message: string; notified: boolean };
type AutomationRule = {
  enabled: boolean;
  executionMode: 'manual' | 'automatic';
  thresholdKwh: number;
  runAtLocal: string;
  sunny: ProfileConfig;
  cloudy: ProfileConfig;
  updatedAt: string | null;
  configured: boolean;
  credentialsConfigured: boolean;
  notificationsConfigured: boolean;
  lastExecution: LastExecution | null;
};
type ApplyResponse = {
  confirmed: boolean; changed: boolean; preset: Preset; before: InverterSettings; target: ProfileConfig; after: InverterSettings;
  audit: { stored: boolean; id?: number | null }; message: string;
};
type Props = { deviceSn: string; siteLabel: string; currentTime: string; tomorrowDate: string; tomorrowForecast: number | null };

const DEFAULTS: Pick<AutomationRule, 'enabled'|'executionMode'|'thresholdKwh'|'runAtLocal'|'sunny'|'cloudy'|'updatedAt'|'configured'|'credentialsConfigured'|'notificationsConfigured'|'lastExecution'> = {
  enabled: false, executionMode: 'manual', thresholdKwh: 20, runAtLocal: '22:00',
  sunny: { redischarge: 25, output: 'SBU' }, cloudy: { redischarge: 50, output: 'SOL' },
  updatedAt: null, configured: false, credentialsConfigured: false, notificationsConfigured: false, lastExecution: null
};

function dateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(year, month - 1, day));
}

function vapidArray(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export default function ProgrammingPage({ deviceSn, siteLabel, currentTime, tomorrowDate, tomorrowForecast }: Props) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<SettingsCheck | null>(null);
  const [automation, setAutomation] = useState<AutomationRule | null>(null);
  const [draft, setDraft] = useState<AutomationRule>({ ...DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [applying, setApplying] = useState<Preset | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState('');
  const hasForecast = tomorrowForecast != null;
  const qualifies = hasForecast && tomorrowForecast > draft.thresholdKwh;

  async function loadAutomation() {
    const value = await api<AutomationRule>(`devices/${deviceSn}/automation`);
    setAutomation(value);
    setDraft(value);
    return value;
  }

  useEffect(() => {
    let active = true;
    setAutomation(null);
    if (!deviceSn) return () => { active = false; };
    api<AutomationRule>(`devices/${deviceSn}/automation`).then((value) => {
      if (active) { setAutomation(value); setDraft(value); }
    }).catch((cause) => active && setError(cause instanceof Error ? cause.message : 'No se pudo cargar la automatización.'));
    return () => { active = false; };
  }, [deviceSn]);

  async function checkSettings() {
    setChecking(true); setError(''); setActionMessage('');
    try { setResult(await api<SettingsCheck>(`devices/${deviceSn}/settings-check`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible leer la configuración del inversor.'); }
    finally { setChecking(false); }
  }

  async function applyPreset(preset: Preset) {
    const profile = draft[preset];
    const target = `Redischarge ${profile.redischarge}% y Output ${profile.output}`;
    if (!window.confirm(`Se modificará ${siteLabel} a ${target}. ¿Confirmas el cambio manual?`)) return;
    setApplying(preset); setError(''); setActionMessage('');
    try {
      const response = await api<ApplyResponse>(`devices/${deviceSn}/settings-apply`, { method: 'POST', body: JSON.stringify({ preset, forecastDate: tomorrowDate, forecastKwh: tomorrowForecast }) });
      setResult({ ...response.after, observedAt: new Date().toISOString(), readOnly: false });
      setActionMessage(`${response.message}${response.audit.stored ? ' El resultado quedó respaldado en Mi Solar.' : ''}`);
    } catch (cause) {
      const details = (cause as { details?: Partial<ApplyResponse> })?.details;
      if (details?.after) setResult({ ...details.after, observedAt: new Date().toISOString(), readOnly: false });
      setError(cause instanceof Error ? cause.message : 'No fue posible aplicar la configuración.');
    } finally { setApplying(null); }
  }

  async function saveConfiguration() {
    setSaving(true); setError(''); setActionMessage('');
    try {
      const next = await api<AutomationRule>(`devices/${deviceSn}/automation`, {
        method: 'PUT', body: JSON.stringify({ thresholdKwh: draft.thresholdKwh, runAtLocal: draft.runAtLocal, sunny: draft.sunny, cloudy: draft.cloudy })
      });
      setAutomation(next); setDraft(next); setActionMessage('Configuración de automatización guardada en Mi Solar.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible guardar la configuración.'); }
    finally { setSaving(false); }
  }

  async function saveCredentials() {
    setSavingCredentials(true); setError(''); setActionMessage('');
    try {
      const response = await api<{ configured: boolean; message: string }>(`devices/${deviceSn}/automation-credentials`, {
        method: 'PUT', body: JSON.stringify({ username, password })
      });
      setUsername(''); setPassword(''); await loadAutomation(); setActionMessage(response.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible guardar el acceso automático.'); }
    finally { setSavingCredentials(false); }
  }

  async function enableNotifications() {
    setSavingNotifications(true); setError(''); setActionMessage('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Este navegador no admite notificaciones push.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Debes permitir las notificaciones del navegador.');
      const registration = await navigator.serviceWorker.register('/sw.js');
      const { publicKey } = await api<{ publicKey: string }>('push/public-key');
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidArray(publicKey) });
      await api(`devices/${deviceSn}/push-subscription`, { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
      await loadAutomation(); setActionMessage('Notificaciones del celular activadas para esta instalación.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible activar las notificaciones.'); }
    finally { setSavingNotifications(false); }
  }

  async function toggleAutomation() {
    if (!automation) return;
    setSaving(true); setError(''); setActionMessage('');
    try {
      const next = await api<AutomationRule>(`devices/${deviceSn}/automation`, { method: 'PUT', body: JSON.stringify({ enabled: !automation.enabled }) });
      setAutomation(next); setDraft(next);
      setActionMessage(`Automatización ${next.enabled ? 'activada' : 'desactivada'} y guardada. ${next.enabled ? `Se evaluará diariamente a las ${next.runAtLocal}, hora de Chile.` : ''}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado de automatización.'); }
    finally { setSaving(false); }
  }

  const setProfile = (preset: Preset, patch: Partial<ProfileConfig>) => setDraft((value) => ({ ...value, [preset]: { ...value[preset], ...patch } }));
  const setThreshold = (value: number) => setDraft((current) => ({ ...current, thresholdKwh: Math.max(0, Math.min(60, value)) }));

  return <section className="settings-page">
    <header className="page-heading"><div><small>Automatización · {siteLabel}</small><h1>Programación solar</h1><p>La decisión utiliza exactamente la proyección recalibrada de la sección Radiación.</p></div></header>

    <section className="panel programming-alert programming-safe"><ShieldCheck/><div><strong>Control secuencial con verificación</strong><p>Cada parámetro se envía por separado, espera cinco segundos y se confirma antes de continuar.</p></div></section>

    <section className="panel automation-rule-card">
      <header><div><small>Pronóstico de mañana</small><h2>{dateLabel(tomorrowDate)}</h2></div><span className="automation-time"><Clock3 size={17}/> Evaluación · {draft.runAtLocal}</span></header>
      <div className="automation-rule-grid">
        <article className="automation-step"><CalendarClock/><span><small>Hora actual</small><strong>{currentTime} · Chile</strong></span></article>
        <article className="automation-step"><Sun/><span><small>Generación estimada</small><strong>{hasForecast ? `${tomorrowForecast.toFixed(1)} kWh` : 'Pronóstico pendiente'}</strong></span></article>
        <article className={`automation-step automation-condition ${hasForecast ? (qualifies ? 'pass' : 'fail') : 'pending'}`}><CheckCircle2/><span><small>Umbral {draft.thresholdKwh} kWh</small><strong>{hasForecast ? (qualifies ? 'Mañana día de sol' : 'Mañana día nublado') : 'Esperando radiación'}</strong></span></article>
      </div>
    </section>

    <details className="panel automation-setup">
      <summary><span><Settings2/><b>Setup de automatización</b><small>Perfiles, umbral, horario, acceso y notificaciones</small></span><ChevronDown/></summary>
      <div className="automation-setup-body">
        <section className="setup-section"><header><div><small>Condición de activación</small><h3>Generación solar de mañana</h3></div></header>
          <div className="threshold-control"><button type="button" aria-label="Disminuir umbral" onClick={() => setThreshold(draft.thresholdKwh - 1)}><Minus/></button><label><input aria-label="Umbral de generación solar" type="number" min="0" max="60" step="1" value={draft.thresholdKwh} onChange={(event) => setThreshold(Number(event.target.value))}/><span>kWh</span></label><button type="button" aria-label="Aumentar umbral" onClick={() => setThreshold(draft.thresholdKwh + 1)}><Plus/></button></div>
          <p>Sobre {draft.thresholdKwh} kWh se utiliza “día soleado”; con {draft.thresholdKwh} kWh o menos se utiliza “día nublado”.</p>
        </section>

        <section className="setup-profile-grid">
          {(['sunny','cloudy'] as Preset[]).map((preset) => <article className={`setup-profile ${preset}`} key={preset}><header>{preset === 'sunny' ? <Sun/> : <CloudSun/>}<div><small>Perfil automático</small><h3>{preset === 'sunny' ? 'Mañana día de sol' : 'Mañana día nublado'}</h3></div></header><label>Redischarge<input type="number" min="10" max="100" step="5" value={draft[preset].redischarge} onChange={(event) => setProfile(preset, { redischarge: Number(event.target.value) })}/><span>%</span></label><label>Output<select value={draft[preset].output} onChange={(event) => setProfile(preset, { output: event.target.value as ProfileConfig['output'] })}><option value="Utility">Utility</option><option value="SOL">SOL</option><option value="SBU">SBU</option></select></label></article>)}
        </section>

        <section className="setup-section schedule-setup"><header><Clock3/><div><small>Hora local de Chile</small><h3>Ejecución diaria</h3></div></header><input type="time" step="300" value={draft.runAtLocal} onChange={(event) => setDraft((value) => ({ ...value, runAtLocal: event.target.value }))}/><p>Supabase revisa cada cinco minutos y ejecuta una sola vez por día.</p></section>
        <button className="primary-action setup-save" type="button" disabled={saving} onClick={saveConfiguration}><Save/>{saving ? 'Guardando…' : 'Guardar configuración'}</button>

        <details className="setup-subdetails"><summary><span><KeyRound/> Acceso automático a i.Solar</span><b>{automation?.credentialsConfigured ? 'Configurado' : 'Pendiente'}</b></summary><div><p>Se valida una vez y se guarda cifrado. Nunca se muestra nuevamente.</p><input autoComplete="username" placeholder="Usuario i.Solar" value={username} onChange={(event) => setUsername(event.target.value)}/><input autoComplete="new-password" type="password" placeholder="Contraseña i.Solar" value={password} onChange={(event) => setPassword(event.target.value)}/><button className="primary-action" type="button" disabled={savingCredentials || !username || !password} onClick={saveCredentials}>{savingCredentials ? 'Validando…' : 'Validar y guardar acceso'}</button></div></details>
        <details className="setup-subdetails"><summary><span><BellRing/> Notificaciones del celular</span><b>{automation?.notificationsConfigured ? 'Activadas' : 'Pendientes'}</b></summary><div><p>En iPhone, agrega primero Mi Solar a la pantalla de inicio y abre la aplicación desde ese icono.</p><button className="primary-action" type="button" disabled={savingNotifications} onClick={enableNotifications}>{savingNotifications ? 'Activando…' : 'Activar notificaciones en este celular'}</button></div></details>
      </div>
    </details>

    <section className="programming-presets" aria-label="Configuraciones manuales">
      <button className={`panel preset-button preset-sunny ${qualifies ? 'recommended' : ''}`} type="button" disabled={Boolean(applying)} onClick={() => applyPreset('sunny')}><span className="preset-icon"><Sun/></span><span><small>{qualifies ? 'Recomendado por la proyección' : 'Configuración alternativa'}</small><strong>Mañana día de sol</strong><em>Redischarge {draft.sunny.redischarge}% · Output {draft.sunny.output}</em></span><b>{applying === 'sunny' ? 'Aplicando…' : 'Aplicar'}</b></button>
      <button className={`panel preset-button preset-cloudy ${hasForecast && !qualifies ? 'recommended' : ''}`} type="button" disabled={Boolean(applying)} onClick={() => applyPreset('cloudy')}><span className="preset-icon"><CloudSun/></span><span><small>{hasForecast && !qualifies ? 'Recomendado por la proyección' : 'Configuración alternativa'}</small><strong>Mañana día nublado</strong><em>Redischarge {draft.cloudy.redischarge}% · Output {draft.cloudy.output}</em></span><b>{applying === 'cloudy' ? 'Aplicando…' : 'Aplicar'}</b></button>
    </section>

    <section className="panel settings-test-card"><header><div><small>Equipo seleccionado</small><h2>{siteLabel}</h2></div><span className="read-only-badge">Comprobación</span></header><button className="primary-action settings-test-button" type="button" disabled={checking || !deviceSn || Boolean(applying)} onClick={checkSettings}><PlayCircle/>{checking ? 'Consultando inversor…' : 'Leer configuración actual'}</button>{error ? <p className="settings-test-error" role="alert">{error}</p> : null}{actionMessage ? <p className="settings-action-success" role="status">{actionMessage}</p> : null}{result ? <div className="settings-result-grid" aria-live="polite"><article><small>Redischarge actual</small><strong>{result.redischarge.percent == null ? 'No identificado' : `${result.redischarge.percent}%`}</strong></article><article><small>Output actual</small><strong>{result.output.mode || 'No identificado'}</strong></article></div> : null}{automation?.lastExecution ? <p className="last-automation-result"><b>Última automatización:</b> {automation.lastExecution.message}</p> : null}</section>

    <section className="panel automation-switch-card"><div><small>Estado persistente</small><h2>Automatizar</h2><p>{automation?.enabled ? `Activa · próxima evaluación diaria a las ${automation.runAtLocal}, hora de Chile.` : 'Actívala después de guardar el acceso automático. Funcionará aunque la página esté cerrada.'}</p></div><button className={`automation-switch ${automation?.enabled ? 'on' : ''}`} type="button" role="switch" aria-checked={Boolean(automation?.enabled)} disabled={!automation || saving} onClick={toggleAutomation}><span/><strong>{saving ? 'Guardando…' : automation?.enabled ? 'Activada' : 'Desactivada'}</strong></button></section>
  </section>;
}
