import { useEffect, useState } from 'react';
import { BellRing, CalendarClock, CheckCircle2, ChevronDown, CloudSun, Clock3, KeyRound, PlayCircle, PlugZap, Plus, Save, Settings2, ShieldCheck, Sun, Trash2, WifiOff, Zap } from 'lucide-react';
import { api } from '../services/api';

type InverterSettings = {
  redischarge: { percent: number | null; command: string | null; status: 'recognized' | 'not-found' };
  output: { mode: 'Utility' | 'SOL' | 'SBU' | null; command: string | null; status: 'recognized' | 'not-found' };
};
type SettingsCheck = InverterSettings & { observedAt: string; readOnly: boolean };
type Preset = 'sunny' | 'cloudy';
type ProfileConfig = { redischarge: number; output: 'Utility' | 'SOL' | 'SBU' };
type AutomationCondition = { id:string; enabled:boolean; kind:'lessThan'|'between'; minKwh:number; maxKwh:number; preset:Preset; runAtLocal:string; dayOffset:0|-1 };
type NotificationPreferences = { automationExecuted:boolean; automationState:boolean; serviceOutage:boolean; gridOutage:boolean; solarSurplus:boolean };
type LastExecution = { forecast_date: string; evaluated_at: string; forecast_kwh: number; preset: Preset; action: 'changed' | 'unchanged' | 'failed'; message: string; notified: boolean };
type AutomationRule = {
  enabled: boolean;
  executionMode: 'manual' | 'automatic';
  thresholdKwh: number;
  runAtLocal: string;
  sunny: ProfileConfig;
  cloudy: ProfileConfig;
  conditions: AutomationCondition[];
  notificationPreferences: NotificationPreferences;
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
type PushStatus = { configured:boolean; count:number; lastSubscribedAt:string|null; lastSuccessAt:string|null; failures:number; serverConfigured:boolean };
type Props = { deviceSn: string; siteLabel: string; currentTime: string; tomorrowDate: string; tomorrowForecast: number | null };

const DEFAULTS: Pick<AutomationRule, 'enabled'|'executionMode'|'thresholdKwh'|'runAtLocal'|'sunny'|'cloudy'|'conditions'|'notificationPreferences'|'updatedAt'|'configured'|'credentialsConfigured'|'notificationsConfigured'|'lastExecution'> = {
  enabled: false, executionMode: 'manual', thresholdKwh: 20, runAtLocal: '22:00',
  sunny: { redischarge: 25, output: 'SBU' }, cloudy: { redischarge: 50, output: 'SOL' },
  conditions: [
    {id:'cloudy-default',enabled:true,kind:'lessThan',minKwh:0,maxKwh:20,preset:'cloudy',runAtLocal:'22:00',dayOffset:-1},
    {id:'sunny-default',enabled:true,kind:'between',minKwh:20,maxKwh:60,preset:'sunny',runAtLocal:'22:00',dayOffset:-1}
  ],
  notificationPreferences: { automationExecuted: true, automationState: true, serviceOutage: true, gridOutage: true, solarSurplus: true },
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
  const [testingNotifications, setTestingNotifications] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationError, setNotificationError] = useState('');
  const [notificationStage, setNotificationStage] = useState('Sin comprobar');
  const [pushStatus, setPushStatus] = useState<PushStatus|null>(null);
  const [applying, setApplying] = useState<Preset | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState('');
  const hasForecast = tomorrowForecast != null;
  const matchedCondition = hasForecast ? draft.conditions.find((condition) => condition.enabled && (condition.kind === 'lessThan' ? tomorrowForecast < condition.maxKwh : tomorrowForecast >= condition.minKwh && tomorrowForecast <= condition.maxKwh)) : null;
  const qualifies = matchedCondition?.preset === 'sunny';

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
    api<PushStatus>(`devices/${deviceSn}/push-status`).then(value=>active&&setPushStatus(value)).catch(()=>active&&setPushStatus(null));
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
        method: 'PUT', body: JSON.stringify({ thresholdKwh: draft.conditions.find(item=>item.preset==='sunny')?.minKwh ?? draft.thresholdKwh, runAtLocal: draft.conditions[0]?.runAtLocal ?? draft.runAtLocal, sunny: draft.sunny, cloudy: draft.cloudy, conditions: draft.conditions })
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
    setSavingNotifications(true); setNotificationError(''); setNotificationMessage(''); setNotificationStage('Comprobando el iPhone…');
    try {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isInstalled = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone);
      if (!window.isSecureContext) throw new Error('Las notificaciones requieren abrir Mi Solar mediante https://misolar.vercel.app.');
      if (isIos && !isInstalled) throw new Error('En iPhone las notificaciones sólo funcionan desde la app instalada. Abre Safari → Compartir → Agregar a pantalla de inicio; luego abre Mi Solar desde ese nuevo icono.');
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Este iPhone o navegador no admite notificaciones web. En iPhone se requiere iOS 16.4 o posterior y la app instalada en la pantalla de inicio.');
      setNotificationStage('Solicitando permiso…');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error(permission === 'denied' ? 'El permiso está bloqueado. Ve a Ajustes del iPhone → Notificaciones → Mi Solar y actívalo; luego vuelve a probar.' : 'El permiso no fue aceptado. Presiona nuevamente y selecciona Permitir.');
      setNotificationStage('Preparando el servicio…');
      const registration = await navigator.serviceWorker.register('/sw.js?v=8.16.0', {scope:'/'});
      await registration.update().catch(()=>undefined);
      const ready = await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>window.setTimeout(()=>reject(new Error('El servicio de notificaciones no terminó de iniciar. Cierra y vuelve a abrir Mi Solar desde el icono.')),12000))]);
      const { publicKey } = await api<{ publicKey: string }>('push/public-key');
      setNotificationStage('Creando una suscripción nueva…');
      const previous = await ready.pushManager.getSubscription();
      if(previous) await previous.unsubscribe().catch(()=>false);
      const subscription = await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidArray(publicKey) });
      const serialized=subscription.toJSON();
      if(!serialized.endpoint||!serialized.keys?.p256dh||!serialized.keys?.auth) throw new Error('El iPhone creó una suscripción incompleta. Reinicia el teléfono y vuelve a intentar.');
      setNotificationStage('Guardando en Mi Solar…');
      await api(`devices/${deviceSn}/push-subscription`, { method: 'POST', body: JSON.stringify(serialized) });
      const stored=await api<PushStatus>(`devices/${deviceSn}/push-status`);
      setPushStatus(stored);
      if(!stored.configured||stored.count<1)throw new Error('El servidor no logró guardar la suscripción del celular.');
      setNotificationStage('Enviando la prueba…');
      const test = await api<{message:string}>(`devices/${deviceSn}/push-test`, {method:'POST'});
      const verified=await api<PushStatus>(`devices/${deviceSn}/push-status`);setPushStatus(verified);
      await loadAutomation(); setNotificationStage('Prueba enviada');setNotificationMessage(`${test.message} Si la app estaba abierta, revisa también el Centro de Notificaciones del iPhone.`);
    } catch (cause) { setNotificationStage('No activadas');setNotificationError(cause instanceof Error ? cause.message : 'No fue posible activar las notificaciones.'); }
    finally { setSavingNotifications(false); }
  }

  async function testNotifications(){
    setTestingNotifications(true);setNotificationError('');setNotificationMessage('');setNotificationStage('Comprobando suscripción…');
    try{const status=await api<PushStatus>(`devices/${deviceSn}/push-status`);setPushStatus(status);if(!status.configured)throw new Error('Este celular todavía no está suscrito. Usa primero “Activar y probar”.');setNotificationStage('Enviando la prueba…');const response=await api<{message:string}>(`devices/${deviceSn}/push-test`,{method:'POST'});const verified=await api<PushStatus>(`devices/${deviceSn}/push-status`);setPushStatus(verified);setNotificationStage('Prueba enviada');setNotificationMessage(response.message)}
    catch(cause){setNotificationStage('Prueba fallida');setNotificationError(cause instanceof Error?cause.message:'No fue posible enviar la prueba.')}
    finally{setTestingNotifications(false)}
  }

  async function saveNotificationPreferences() {
    setSavingNotifications(true); setNotificationError(''); setNotificationMessage('');
    try {
      const next = await api<AutomationRule>(`devices/${deviceSn}/automation`, {
        method: 'PUT', body: JSON.stringify({ notificationPreferences: draft.notificationPreferences })
      });
      setAutomation(next); setDraft(next); setNotificationMessage('Preferencias guardadas. Estos avisos quedan activos aunque la aplicación esté cerrada.');
    } catch (cause) {
      setNotificationError(cause instanceof Error ? cause.message : 'No fue posible guardar las preferencias.');
    } finally { setSavingNotifications(false); }
  }

  async function toggleAutomation() {
    if (!automation) return;
    setSaving(true); setError(''); setActionMessage('');
    try {
      const next = await api<AutomationRule>(`devices/${deviceSn}/automation`, { method: 'PUT', body: JSON.stringify({ enabled: !automation.enabled }) });
      setAutomation(next); setDraft(next);
      setActionMessage(`Automatización ${next.enabled ? 'activada' : 'desactivada'} y guardada. ${next.enabled ? 'Cada condición se evaluará en su propio horario, hora de Chile.' : ''}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado de automatización.'); }
    finally { setSaving(false); }
  }

  const setProfile = (preset: Preset, patch: Partial<ProfileConfig>) => setDraft((value) => ({ ...value, [preset]: { ...value[preset], ...patch } }));
  const updateCondition=(id:string,patch:Partial<AutomationCondition>)=>setDraft(value=>({...value,conditions:value.conditions.map(item=>item.id===id?{...item,...patch}:item)}));
  const addCondition=()=>setDraft(value=>({...value,conditions:[...value.conditions,{id:globalThis.crypto?.randomUUID?.()||`rule-${Date.now()}`,enabled:true,kind:'between',minKwh:0,maxKwh:60,preset:'cloudy',runAtLocal:'22:00',dayOffset:-1}]}));
  const removeCondition=(id:string)=>setDraft(value=>({...value,conditions:value.conditions.filter(item=>item.id!==id)}));
  const setNotificationPreference=(key:keyof NotificationPreferences,value:boolean)=>setDraft(current=>({...current,notificationPreferences:{...current.notificationPreferences,[key]:value}}));

  return <section className="settings-page">
    <header className="page-heading"><div><small>Automatización · {siteLabel}</small><h1>Programación solar</h1><p>La decisión utiliza exactamente la proyección recalibrada de la sección Radiación.</p></div></header>

    <section className="panel programming-alert programming-safe"><ShieldCheck/><div><strong>Control secuencial con verificación</strong><p>Cada parámetro se envía por separado, espera cinco segundos y se confirma antes de continuar.</p></div></section>

    <section className="panel automation-rule-card">
      <header><div><small>Pronóstico de mañana</small><h2>{dateLabel(tomorrowDate)}</h2></div><span className="automation-time"><Clock3 size={17}/> {matchedCondition?`${matchedCondition.runAtLocal} · ${matchedCondition.dayOffset===-1?'día anterior':'mismo día'}`:'Sin regla coincidente'}</span></header>
      <div className="automation-rule-grid">
        <article className="automation-step"><CalendarClock/><span><small>Hora actual</small><strong>{currentTime} · Chile</strong></span></article>
        <article className="automation-step"><Sun/><span><small>Generación estimada</small><strong>{hasForecast ? `${tomorrowForecast.toFixed(1)} kWh` : 'Pronóstico pendiente'}</strong></span></article>
        <article className={`automation-step automation-condition ${hasForecast ? (matchedCondition?'pass':'fail') : 'pending'}`}><CheckCircle2/><span><small>Condición automática</small><strong>{hasForecast ? (matchedCondition?`Perfil ${matchedCondition.preset==='sunny'?'soleado':'nublado'}`:'Ninguna regla cubre la proyección') : 'Esperando radiación'}</strong></span></article>
      </div>
    </section>

    <details className="panel automation-setup">
      <summary><span><Settings2/><b>Setup de automatización</b><small>Perfiles, umbral, horario y acceso</small></span><ChevronDown/></summary>
      <div className="automation-setup-body">
        <section className="setup-section automation-conditions"><header><div><small>Condiciones de activación</small><h3>Reglas según la generación proyectada</h3></div><button type="button" className="add-condition" disabled={draft.conditions.length>=12} onClick={addCondition}><Plus/> Agregar condición</button></header>
          <p>Las reglas se evalúan con la proyección de Radiación. Puedes decidir el perfil, la hora chilena y si se ejecuta el día anterior o el mismo día pronosticado.</p>
          <div className="condition-list">{draft.conditions.map((condition,index)=><article className="condition-editor" key={condition.id}>
            <span className="condition-number">{index+1}</span>
            <label>Cuando la generación sea<select value={condition.kind} onChange={event=>updateCondition(condition.id,{kind:event.target.value as AutomationCondition['kind']})}><option value="lessThan">Menor a</option><option value="between">Entre</option></select></label>
            {condition.kind==='between'&&<label>Desde<input type="number" min="0" max="60" value={condition.minKwh} onChange={event=>updateCondition(condition.id,{minKwh:Math.max(0,Math.min(60,Number(event.target.value)))})}/><small>kWh</small></label>}
            <label>{condition.kind==='between'?'Hasta':'Límite'}<input type="number" min="0" max="60" value={condition.maxKwh} onChange={event=>updateCondition(condition.id,{maxKwh:Math.max(0,Math.min(60,Number(event.target.value)))})}/><small>kWh</small></label>
            <label>Aplicar perfil<select value={condition.preset} onChange={event=>updateCondition(condition.id,{preset:event.target.value as Preset})}><option value="cloudy">☁️ Día nublado</option><option value="sunny">☀️ Día soleado</option></select></label>
            <label>Ejecutar<input type="time" step="300" value={condition.runAtLocal} onChange={event=>updateCondition(condition.id,{runAtLocal:event.target.value})}/></label>
            <label>Momento<select value={condition.dayOffset} onChange={event=>updateCondition(condition.id,{dayOffset:Number(event.target.value) as 0|-1})}><option value={-1}>Día anterior</option><option value={0}>Mismo día</option></select></label>
            <button type="button" className="delete-condition" aria-label={`Eliminar condición ${index+1}`} disabled={draft.conditions.length===1} onClick={()=>removeCondition(condition.id)}><Trash2/></button>
          </article>)}</div>
        </section>

        <section className="setup-profile-grid">
          {(['sunny','cloudy'] as Preset[]).map((preset) => <article className={`setup-profile ${preset}`} key={preset}><header>{preset === 'sunny' ? <Sun/> : <CloudSun/>}<div><small>Perfil automático</small><h3>{preset === 'sunny' ? 'Mañana día de sol' : 'Mañana día nublado'}</h3></div></header><label>Redischarge<input type="number" min="10" max="100" step="5" value={draft[preset].redischarge} onChange={(event) => setProfile(preset, { redischarge: Number(event.target.value) })}/><span>%</span></label><label>Output<select value={draft[preset].output} onChange={(event) => setProfile(preset, { output: event.target.value as ProfileConfig['output'] })}><option value="Utility">Utility</option><option value="SOL">SOL</option><option value="SBU">SBU</option></select></label></article>)}
        </section>

        <section className="setup-section schedule-setup"><header><Clock3/><div><small>Servicio autónomo</small><h3>Revisión cada cinco minutos</h3></div></header><p>Cada condición tiene su propio horario. Mi Solar ejecuta como máximo una configuración por fecha proyectada, aunque la página esté cerrada.</p></section>
        <button className="primary-action setup-save" type="button" disabled={saving} onClick={saveConfiguration}><Save/>{saving ? 'Guardando…' : 'Guardar configuración'}</button>

        <details className="setup-subdetails"><summary><span><KeyRound/> Acceso automático a i.Solar</span><b>{automation?.credentialsConfigured ? 'Configurado' : 'Pendiente'}</b></summary><div><p>Se valida una vez y se guarda cifrado. Nunca se muestra nuevamente.</p><input autoComplete="username" placeholder="Usuario i.Solar" value={username} onChange={(event) => setUsername(event.target.value)}/><input autoComplete="new-password" type="password" placeholder="Contraseña i.Solar" value={password} onChange={(event) => setPassword(event.target.value)}/><button className="primary-action" type="button" disabled={savingCredentials || !username || !password} onClick={saveCredentials}>{savingCredentials ? 'Validando…' : 'Validar y guardar acceso'}</button></div></details>
      </div>
    </details>

    <section className="panel notification-center">
      <header><div><small>Centro de avisos · {siteLabel}</small><h2><BellRing/> Notificaciones</h2><p>Elige qué eventos quieres recibir en este celular. Los controles se guardan por instalación.</p></div><span className={pushStatus?.configured ? 'notification-ready' : 'notification-pending'}>{pushStatus?.configured ? 'Celular conectado' : 'Pendiente de activar'}</span></header>
      <div className="notification-preference-grid">
        <label><span><Zap/><b>Programación ejecutada</b><small>Avisa si se aplicó el perfil soleado o nublado y si hubo cambios.</small></span><input type="checkbox" checked={draft.notificationPreferences.automationExecuted} onChange={event=>setNotificationPreference('automationExecuted',event.target.checked)}/><i/></label>
        <label><span><CheckCircle2/><b>Automatización activada o desactivada</b><small>Confirma inmediatamente cualquier cambio del interruptor.</small></span><input type="checkbox" checked={draft.notificationPreferences.automationState} onChange={event=>setNotificationPreference('automationState',event.target.checked)}/><i/></label>
        <label><span><WifiOff/><b>Caída y recuperación del servicio</b><small>Avisa después de dos sincronizaciones fallidas y cuando el servicio regresa.</small></span><input type="checkbox" checked={draft.notificationPreferences.serviceOutage} onChange={event=>setNotificationPreference('serviceOutage',event.target.checked)}/><i/></label>
        {siteLabel === 'El Arrayán' ? <label><span><PlugZap/><b>Corte y regreso de la red eléctrica</b><small>Detecta red inactiva con la casa funcionando desde batería. También confirma cuando vuelve la luz.</small></span><input type="checkbox" checked={draft.notificationPreferences.gridOutage} onChange={event=>setNotificationPreference('gridOutage',event.target.checked)}/><i/></label> : null}
        <label><span><Sun/><b>Solar mayor al consumo</b><small>Avisa una vez al día cuando los paneles superen el consumo de la casa.</small></span><input type="checkbox" checked={draft.notificationPreferences.solarSurplus} onChange={event=>setNotificationPreference('solarSurplus',event.target.checked)}/><i/></label>
      </div>
      <div className="notification-diagnostic"><span><small>Estado</small><strong>{notificationStage}</strong></span><span><small>Celulares guardados</small><strong>{pushStatus?.count ?? (automation?.notificationsConfigured?1:0)}</strong></span><span><small>Última entrega</small><strong>{pushStatus?.lastSuccessAt?new Date(pushStatus.lastSuccessAt).toLocaleString('es-CL'):'Sin entrega confirmada'}</strong></span></div>
      {!automation?.credentialsConfigured?<p className="notification-credential-note">Para vigilar el servicio y la producción de {siteLabel}, guarda primero el acceso automático a i.Solar en el Setup de esta instalación.</p>:null}
      {notificationError?<p className="notification-inline-error" role="alert">{notificationError}</p>:null}
      {notificationMessage?<p className="notification-inline-success" role="status">{notificationMessage}</p>:null}
      <div className="notification-actions"><button className="primary-action" type="button" disabled={savingNotifications} onClick={saveNotificationPreferences}><Save/>{savingNotifications ? 'Guardando…' : 'Guardar notificaciones'}</button><button className="secondary-action" type="button" disabled={savingNotifications} onClick={enableNotifications}>{savingNotifications ? notificationStage : 'Activar o reparar celular'}</button><button className="secondary-action" type="button" disabled={testingNotifications} onClick={testNotifications}>{testingNotifications?notificationStage:'Enviar prueba'}</button></div>
    </section>

    <section className="programming-presets" aria-label="Configuraciones manuales">
      <button className={`panel preset-button preset-sunny ${qualifies ? 'recommended' : ''}`} type="button" disabled={Boolean(applying)} onClick={() => applyPreset('sunny')}><span className="preset-icon"><Sun/></span><span><small>{qualifies ? 'Recomendado por la proyección' : 'Configuración alternativa'}</small><strong>Mañana día de sol</strong><em>Redischarge {draft.sunny.redischarge}% · Output {draft.sunny.output}</em></span><b>{applying === 'sunny' ? 'Aplicando…' : 'Aplicar'}</b></button>
      <button className={`panel preset-button preset-cloudy ${hasForecast && !qualifies ? 'recommended' : ''}`} type="button" disabled={Boolean(applying)} onClick={() => applyPreset('cloudy')}><span className="preset-icon"><CloudSun/></span><span><small>{hasForecast && !qualifies ? 'Recomendado por la proyección' : 'Configuración alternativa'}</small><strong>Mañana día nublado</strong><em>Redischarge {draft.cloudy.redischarge}% · Output {draft.cloudy.output}</em></span><b>{applying === 'cloudy' ? 'Aplicando…' : 'Aplicar'}</b></button>
    </section>

    <section className="panel settings-test-card"><header><div><small>Equipo seleccionado</small><h2>{siteLabel}</h2></div><span className="read-only-badge">Comprobación</span></header><button className="primary-action settings-test-button" type="button" disabled={checking || !deviceSn || Boolean(applying)} onClick={checkSettings}><PlayCircle/>{checking ? 'Consultando inversor…' : 'Leer configuración actual'}</button>{error ? <p className="settings-test-error" role="alert">{error}</p> : null}{actionMessage ? <p className="settings-action-success" role="status">{actionMessage}</p> : null}{result ? <div className="settings-result-grid" aria-live="polite"><article><small>Redischarge actual</small><strong>{result.redischarge.percent == null ? 'No identificado' : `${result.redischarge.percent}%`}</strong></article><article><small>Output actual</small><strong>{result.output.mode || 'No identificado'}</strong></article></div> : null}{automation?.lastExecution ? <p className="last-automation-result"><b>Última automatización:</b> {automation.lastExecution.message}</p> : null}</section>

    <section className="panel automation-switch-card"><div><small>Estado persistente</small><h2>Automatizar</h2><p>{automation?.enabled ? `Activa · ${automation.conditions.filter(item=>item.enabled).length} condiciones programadas en hora de Chile.` : 'Actívala después de guardar el acceso automático. Funcionará aunque la página esté cerrada.'}</p></div><button className={`automation-switch ${automation?.enabled ? 'on' : ''}`} type="button" role="switch" aria-checked={Boolean(automation?.enabled)} disabled={!automation || saving} onClick={toggleAutomation}><span/><strong>{saving ? 'Guardando…' : automation?.enabled ? 'Activada' : 'Desactivada'}</strong></button></section>
  </section>;
}
