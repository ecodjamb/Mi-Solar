import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { House, Info, PanelsTopLeft, RadioTower, Server, type LucideIcon } from 'lucide-react';
import type { DailyEnergy, HistoryRow, Realtime } from '../types';
import {
  batteryChargePower,
  batteryDischargePower,
  batterySoc,
  detectPvCount,
  effectiveGridPower,
  firstNumberWithSource,
  firstText,
  gridPower,
  gridUsage,
  inverterOutputPriority,
  inverterFlowMetrics,
  kwh,
  loadPower,
  pvPower,
  watts
} from '../utils/energy';

type Detail = { label: string; value: string };
export type BatteryBank = { model: string; units: number; nominalKwh: number; usableKwh: number };
export type InverterProfile = {
  model: string;
  providerModel: string;
  firmwareMain: string;
  firmwareSecondary: string;
  loggerFirmware: string;
  technicalProfileCapturedAt: string;
  ratedPowerW: number;
  ratedPowerVa: number;
  surgePowerVa: number;
  peakEfficiencyPct: number;
  batteryVoltageV: number;
  mpptCount: number;
  maxPvPowerW: number;
  maxPvPowerPerMpptW: number;
  maxPvOpenCircuitVoltageV: number;
  mpptVoltageMinV: number;
  mpptVoltageMaxV: number;
  maxPvInputCurrentPerMpptA: number;
  maximumChargeCurrentA: number;
};
type BatteryConsistency = {
  startSoc: number | null;
  endSoc: number;
  storedKwh: number;
  netTodayKwh: number;
  expectedSoc: number | null;
  differenceSocPoints: number | null;
  differenceKwh: number | null;
  coherent: boolean | null;
};

const SOC_KEYS = ['batteryCapacity', 'batterySoc', 'soc', 'batteryPercent'];

function calculateBatteryConsistency(history: HistoryRow[], today: DailyEnergy, endSoc: number, bank: BatteryBank): BatteryConsistency {
  const socSamples = history.flatMap((row) => {
    const found = firstNumberWithSource(row, SOC_KEYS);
    return found.key && found.value >= 0 && found.value <= 100 ? [found.value] : [];
  });
  const startSoc = socSamples.length ? socSamples[0] : null;
  const netTodayKwh = today.charge - today.discharge;
  const expectedSoc = startSoc == null ? null : Math.max(0, Math.min(100, startSoc + (netTodayKwh / bank.nominalKwh) * 100));
  const differenceSocPoints = expectedSoc == null ? null : endSoc - expectedSoc;
  const differenceKwh = differenceSocPoints == null ? null : (differenceSocPoints / 100) * bank.nominalKwh;
  return {
    startSoc,
    endSoc,
    storedKwh: bank.nominalKwh * endSoc / 100,
    netTodayKwh,
    expectedSoc,
    differenceSocPoints,
    differenceKwh,
    coherent: differenceSocPoints == null ? null : Math.abs(differenceSocPoints) <= 5
  };
}

function BatteryConsistencyBadge({ check, bank }: { check: BatteryConsistency; bank: BatteryBank }) {
  const statusClass = check.coherent === true ? 'is-ok' : 'is-warning';
  const statusLabel = check.coherent === true ? 'Coincide con el SOC' : check.coherent === false ? 'Diferencia por revisar' : 'Falta SOC inicial del día';
  const difference = check.differenceKwh == null ? 'validación pendiente' : `${Math.abs(check.differenceKwh).toLocaleString('es-CL', { maximumFractionDigits: 2 })} kWh · ${Math.abs(check.differenceSocPoints || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 })} pp`;
  return <div className={`battery-consistency ${statusClass}`} title={`Tolerancia: ±5 puntos de SOC. Banco ${bank.units} × ${bank.model}: ${bank.nominalKwh.toLocaleString('es-CL')} kWh nominales.`}>
    <span><i aria-hidden="true"/><b>{statusLabel}</b><em>±5%</em></span>
    <small>SOC {check.endSoc.toFixed(0)}% ≈ {check.storedKwh.toLocaleString('es-CL', { maximumFractionDigits: 2 })} kWh · diferencia {difference}</small>
  </div>;
}

function cleanDetails(details: Detail[]) {
  return details.filter((item) => item.value !== '—' && item.value !== 'NaN' && item.value !== 'NaN W');
}

function readableLoggerFirmware(value:string){
  if(!value||value==='No disponible')return value;
  const normalized=value.replace(/\.bin_/i,' · ').replace(/_/g,' ');
  return normalized.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/,'$1-$2-$3 $4:$5');
}

function FlowDetails({ title, details }: { title: string; details: Detail[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 320 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const items = cleanDetails(details);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 220);
  };

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(520, Math.max(340, viewportWidth * .42), viewportWidth - 24);
    const availableHeight = Math.max(240, viewportHeight - 24);
    const measuredHeight = popoverRef.current?.getBoundingClientRect().height || 0;
    const estimatedHeight = Math.min(720, availableHeight, measuredHeight || 54 + items.length * 35);
    const below = rect.bottom + 10;
    const above = rect.top - estimatedHeight - 10;
    const top = below + estimatedHeight <= viewportHeight - 12 ? below : Math.max(12, above);
    const left = Math.min(Math.max(12, rect.right - width), viewportWidth - width - 12);
    setPosition({ top, left, width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const onViewportChange = () => updatePosition();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as globalThis.Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  if (!items.length) return null;
  const popover = open ? <div
    ref={popoverRef}
    className="flow-details-popover flow-details-portal"
    onMouseEnter={cancelClose}
    onMouseLeave={scheduleClose}
    role="dialog"
    aria-modal="false"
    aria-label={`Parámetros de ${title}`}
    style={{ top: position.top, left: position.left, width: position.width }}
  >
    <header><strong>{title}</strong><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar detalles">×</button></header>
    <dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
  </div> : null;

  return <div className={`flow-details-wrap ${open ? 'is-open' : ''}`} onMouseEnter={() => { cancelClose(); setOpen(true); }} onMouseLeave={scheduleClose}>
    <button ref={triggerRef} className="flow-details-trigger" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <Info size={15}/><span>Detalles</span>
    </button>
    {popover && createPortal(popover, document.body)}
  </div>;
}

function BatterySocIcon({ soc }: { soc: number }) {
  const level = Math.max(0, Math.min(100, Number.isFinite(soc) ? soc : 0));
  const rounded = Math.round(level);
  const gradientId = `battery-soc-${useId().replace(/:/g, '')}`;
  return <svg className="soc-battery-icon" data-soc={rounded} width="30" height="30" viewBox="0 0 32 24" role="img" aria-label={`Batería al ${rounded}%`}>
    <title>{`Estado de carga: ${rounded}%`}</title>
    <defs>
      <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor="currentColor"/>
        <stop offset={`${level}%`} stopColor="currentColor"/>
        <stop offset={`${level}%`} stopColor="transparent"/>
        <stop offset="100%" stopColor="transparent"/>
      </linearGradient>
    </defs>
    <rect className="soc-battery-empty" x="2.8" y="5.8" width="22.4" height="12.4" rx="1.7"/>
    <rect className="soc-battery-fill" x="2.8" y="5.8" width="22.4" height="12.4" rx="1.7" fill={`url(#${gradientId})`}/>
    <rect className="soc-battery-outline" x="1.5" y="4.5" width="25" height="15" rx="3"/>
    <path className="soc-battery-terminal" d="M28 9v6"/>
  </svg>;
}

function Node({ className, icon: Icon, indicator, title, value, status, accumulated, details }: {
  className: string;
  icon?: LucideIcon;
  indicator?: ReactNode;
  title: string;
  value: string;
  status: string;
  accumulated: ReactNode;
  details: Detail[];
}) {
  return <article className={`simple-flow-node ${className}`} tabIndex={0}>
    <div className="simple-flow-node-main">{indicator || (Icon ? <Icon size={30}/> : null)}<div><small>{title}</small><strong>{value}</strong><span>{status}</span></div></div>
    <div className="simple-flow-daily">{accumulated}</div>
    <FlowDetails title={title} details={details}/>
  </article>;
}

export default function SimpleEnergyFlow({ data, history, today, gridLabel='Red activa',pvCountOverride,historical=false,dateLabel,liveStatus='Esperando datos',hideHeader=false,presentationMode=false,outputPriorityOverride=null,batteryBank=null,inverterProfile=null,daySolarPotentialKwh=null }: { data: Realtime; history: HistoryRow[]; today: DailyEnergy; gridLabel?:string;pvCountOverride?:1|2;historical?:boolean;dateLabel?:string;liveStatus?:string;hideHeader?:boolean;presentationMode?:boolean;outputPriorityOverride?:string|null;batteryBank?:BatteryBank|null;inverterProfile?:InverterProfile|null;daySolarPotentialKwh?:number|null }) {
  const p1 = pvPower(data, 1), p2 = pvPower(data, 2), solar = p1 + p2;
  const load = loadPower(data), rawGrid = gridPower(data), gridState=gridUsage(data), grid = effectiveGridPower(data);
  const charge = batteryChargePower(data), discharge = batteryDischargePower(data), soc = batterySoc(data);
  const pvCount = pvCountOverride??detectPvCount(data, history);
  const batteryStatus = charge > discharge ? `Cargando ${watts(charge)}` : discharge > 0 ? `Entregando ${watts(discharge)}` : 'En espera';
  const isGenerator=gridLabel==='Generador';
  const gridStatus = isGenerator?(grid>0?'Generador encendido':'Generador detenido'):(grid < 0 ? 'Exportando' : grid > 0 ? 'Importando' : 'Sin intercambio');
  const inverterMetrics = inverterFlowMetrics(data);
  const inverterPower = inverterMetrics.processedPowerW;
  const solarStatus = pvCount === 2 ? `PV1 ${watts(p1)} · PV2 ${watts(p2)}` : 'Un MPPT detectado';
  const measurement = (keys: string[], digits: number, unit: string, fallback: number | null = null) => {
    const found = firstNumberWithSource(data, keys);
    const value = found.key ? found.value : fallback;
    return value == null ? 'No disponible' : `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
  };
  const textMeasurement = (keys: string[], fallback: string | null = null) => firstText(data, keys).value || fallback || 'No disponible';
  const apparentPower = measurement(['acOutputApparentPowerTotal', 'outputApparentPower', 'apparentPower'], 0, 'VA');
  const mode = firstText(data, ['workMode', 'workModeName', 'mode']).value || '—';
  const telemetryOutputPriority = inverterOutputPriority(data);
  const outputPriority = telemetryOutputPriority === '—' ? outputPriorityOverride || '—' : telemetryOutputPriority;
  const batteryConsistency = batteryBank ? calculateBatteryConsistency(history, today, soc, batteryBank) : null;

  const solarDetails: Detail[] = [
    { label: 'PV1 potencia', value: watts(p1) },
    { label: 'PV1 voltaje', value: measurement(['pvInputVoltage1','pvVoltage1','voltageInput1','pv1Voltage'], 1, 'V') },
    { label: 'PV1 corriente', value: measurement(['pvInputCurrent1','pvCurrent1','currentInput1','pv1Current'], 2, 'A') },
    ...(pvCount === 2 ? [
      { label: 'PV2 potencia', value: watts(p2) },
      { label: 'PV2 voltaje', value: measurement(['pvInputVoltage2','pvVoltage2','voltageInput2','pv2Voltage'], 1, 'V') },
      { label: 'PV2 corriente', value: measurement(['pvInputCurrent2','pvCurrent2','currentInput2','pv2Current'], 2, 'A') }
    ] : []),
    { label: 'Generación hoy', value: kwh(today.solar) },
    ...(daySolarPotentialKwh==null?[]:[{label:'Producción prevista para hoy · configuración actual',value:kwh(daySolarPotentialKwh)}])
  ];

  const batteryDetails: Detail[] = [
    { label: 'Estado de carga', value: `${soc.toFixed(1)} %` },
    { label: 'Voltaje', value: measurement(['batteryVoltage','batVoltage'], 1, 'V') },
    { label: 'Corriente (+ entrega / − carga)', value: measurement(['batteryCurrent','batCurrent'], 2, 'A') },
    { label: 'Carga instantánea', value: watts(charge) },
    { label: 'Descarga instantánea', value: watts(discharge) },
    { label: 'Cargada hoy', value: kwh(today.charge) },
    { label: 'Entregada hoy', value: kwh(today.discharge) },
    ...(batteryBank && batteryConsistency ? [
      { label: 'Banco instalado', value: `${batteryBank.units} × ${batteryBank.model}` },
      { label: 'Capacidad nominal total', value: `${batteryBank.nominalKwh.toLocaleString('es-CL')} kWh` },
      { label: 'Capacidad utilizable total', value: `${batteryBank.usableKwh.toLocaleString('es-CL')} kWh` },
      { label: 'Energía estimada por SOC', value: `${batteryConsistency.storedKwh.toLocaleString('es-CL', { maximumFractionDigits: 2 })} kWh` },
      { label: 'SOC inicial del día', value: batteryConsistency.startSoc == null ? 'No disponible' : `${batteryConsistency.startSoc.toFixed(1)} %` },
      { label: 'Saldo cargado del día', value: `${batteryConsistency.netTodayKwh.toLocaleString('es-CL', { maximumFractionDigits: 2 })} kWh` },
      { label: 'SOC esperado por balance', value: batteryConsistency.expectedSoc == null ? 'Pendiente' : `${batteryConsistency.expectedSoc.toFixed(1)} %` },
      { label: 'Diferencia no conciliada', value: batteryConsistency.differenceKwh == null ? 'Pendiente' : `${Math.abs(batteryConsistency.differenceKwh).toLocaleString('es-CL', { maximumFractionDigits: 2 })} kWh (${Math.abs(batteryConsistency.differenceSocPoints || 0).toFixed(1)} pp)` },
      { label: 'Margen aceptado', value: '±5 puntos de SOC' }
    ] : [])
  ];

  const houseDetails: Detail[] = [
    { label: 'Potencia activa', value: watts(load) },
    { label: 'Frecuencia', value: measurement(['acOutputFrequency','outputFrequency'], 1, 'Hz') },
    { label: 'Potencia aparente', value: apparentPower },
    { label: 'Consumo acumulado hoy', value: kwh(today.load) }
  ];

  const gridDetails: Detail[] = [
    { label: 'Potencia efectiva', value: watts(Math.abs(grid)) },
    { label: 'Lectura bruta', value: watts(Math.abs(rawGrid)) },
    { label: 'Uso efectivo (0/1)', value: gridState.status===null?'Inferido':String(gridState.status) },
    { label: 'Parámetro de estado', value: gridState.source },
    { label: 'Sentido', value: gridStatus },
    { label: 'Voltaje', value: measurement(['gridVoltage','gridVoltageR','acInputVoltageR','acInputVoltage','utilityVoltage'], 1, 'V') },
    { label: 'Frecuencia', value: measurement(['gridFrequency','acInputFrequency','utilityFrequency'], 1, 'Hz') },
    { label: isGenerator?'Aporte del generador hoy':'Importado hoy', value: kwh(today.gridImport) },
    ...(!isGenerator?[{ label: 'Exportado hoy', value: kwh(today.gridExport) }]:[])
  ];

  const inverterDetails: Detail[] = [
    { label: 'Modelo instalado', value: textMeasurement(['deviceModel','model'], inverterProfile?.model || null) },
    ...(inverterProfile ? [{ label: 'Familia informada por i.Solar', value: inverterProfile.providerModel }] : []),
    { label: 'Potencia nominal', value: measurement(['ratedOutputPowerW'], 0, 'W', inverterProfile?.ratedPowerW ?? null) },
    { label: 'Potencia nominal aparente', value: measurement(['ratedOutputPowerVa'], 0, 'VA', inverterProfile?.ratedPowerVa ?? null) },
    { label: 'Capacidad de sobretensión', value: measurement([], 0, 'VA', inverterProfile?.surgePowerVa ?? null) },
    { label: 'Seguidores MPPT', value: measurement(['mpptTrackerCount'], 0, '', inverterProfile?.mpptCount ?? null) },
    { label: 'Temperatura interna', value: measurement(['innerTemperature','inverterTemperature','temperature','temperature1'], 1, '°C') },
    { label: 'Temperatura del disipador', value: measurement(['maxTemperature','radiatorTemperature','heatSinkTemperature','heatsinkTemperature','temperature2'], 1, '°C') },
    { label: 'Firmware principal', value: textMeasurement(['mainCpuFirmware','mainVersion'], inverterProfile?.firmwareMain || null) },
    { label: 'Firmware secundario', value: textMeasurement(['secondaryCpuFirmware','remoteVersion'], inverterProfile?.firmwareSecondary || null) },
    { label: 'Firmware Wi‑Fi / logger', value: readableLoggerFirmware(textMeasurement(['loggerFirmware','wifiVersion'], inverterProfile?.loggerFirmware || null)) },
    { label: 'Prioridad de salida', value: outputPriority },
    { label: 'Modo de trabajo', value: mode },
    { label: 'Potencia procesada', value: watts(inverterPower) },
    { label: 'Consumo propio estimado', value: inverterMetrics.estimatedOwnConsumptionW == null ? 'No estimable con esta muestra' : watts(inverterMetrics.estimatedOwnConsumptionW) },
    { label: 'Uso de capacidad AC', value: measurement(['acOutputLoadTotal','outputLoadPercent','loadPercent'], 1, '%') },
    { label: 'Potencia aparente', value: apparentPower },
    { label: 'Voltaje de salida', value: measurement(['acOutputVoltageR','acOutputVoltage','outputVoltage'], 1, 'V') },
    { label: 'Frecuencia de salida', value: measurement(['acOutputFrequency','outputFrequency'], 1, 'Hz') },
    ...(inverterProfile ? [
      { label: 'Entrada FV máxima', value: `${inverterProfile.maxPvPowerW.toLocaleString('es-CL')} W` },
      { label: 'Potencia máxima por MPPT', value: `${inverterProfile.maxPvPowerPerMpptW.toLocaleString('es-CL')} W` },
      { label: 'Ventana de seguimiento MPPT', value: `${inverterProfile.mpptVoltageMinV}–${inverterProfile.mpptVoltageMaxV} Vdc` },
      { label: 'Voc FV máximo', value: `${inverterProfile.maxPvOpenCircuitVoltageV} Vdc` },
      { label: 'Corriente FV máxima', value: `${inverterProfile.maxPvInputCurrentPerMpptA} A por MPPT` },
      { label: 'Eficiencia máxima', value: `${inverterProfile.peakEfficiencyPct}%` },
      { label: 'Batería nominal', value: `${inverterProfile.batteryVoltageV} Vdc` },
      { label: 'Corriente máxima de carga', value: `${inverterProfile.maximumChargeCurrentA} A` },
      { label: 'Perfil técnico capturado', value: inverterProfile.technicalProfileCapturedAt.split('-').reverse().join('-') }
    ] : []),
    { label: 'Código de falla', value: measurement(['fault1','faultCode','errorCode'], 0, '') },
    { label: 'Código de advertencia', value: measurement(['warning1','warningCode'], 0, '') }
  ];

  return <section className={`panel simple-flow-panel${hideHeader?' is-headerless':''}${presentationMode?' is-monitor-presentation':''}`}>
    {!hideHeader?<header className="section-head"><div><small>{historical?'Flujo histórico':'Flujo instantáneo'}</small><h2>{historical?dateLabel:'Tu sistema ahora'}</h2></div><span className={`status-dot ${liveStatus==='En línea'?'is-fresh':'is-stale'}`}>{historical?'Sin animación':liveStatus}</span></header>:null}
    <div className="simple-energy-flow">
      <Node className="simple-solar" icon={PanelsTopLeft} title={pvCount === 2 ? 'Paneles · PV1 + PV2' : 'Paneles'} value={watts(solar)} status={solarStatus} accumulated={<><span>Hoy: {kwh(today.solar)} · PV1 {kwh(today.pv1)}{pvCount === 2 ? ` · PV2 ${kwh(today.pv2)}` : ''}</span>{daySolarPotentialKwh!=null?<small>Producción prevista hoy: <b>{kwh(daySolarPotentialKwh)}</b></small>:null}</>} details={solarDetails}/>
      <Node className="simple-battery" indicator={<BatterySocIcon soc={soc}/>} title={presentationMode?'Batería':`Batería · ${soc.toFixed(0)}%`} value={presentationMode?`${soc.toFixed(0)}%`:watts(Math.max(charge, discharge))} status={batteryStatus} accumulated={<><span>Hoy: cargada {kwh(today.charge)} · entregada {kwh(today.discharge)}</span>{batteryConsistency&&batteryBank?<BatteryConsistencyBadge check={batteryConsistency} bank={batteryBank}/>:null}</>} details={batteryDetails}/>
      <article className="simple-inverter" tabIndex={0}>
        <Server size={39}/><small className="simple-inverter-mode">Inversor <b>({outputPriority})</b></small><strong>{watts(inverterPower)}</strong><span>Operando</span>
        <div className={`simple-inverter-own-use${inverterMetrics.estimatedOwnConsumptionW == null ? ' is-unavailable' : ''}`}>
          <b>{inverterMetrics.estimatedOwnConsumptionW == null ? '—' : watts(inverterMetrics.estimatedOwnConsumptionW)}</b>
          <em>{inverterMetrics.estimatedOwnConsumptionW == null ? 'No estimable' : 'Consumo inversor estimado'}</em>
        </div>
        <FlowDetails title="Inversor" details={inverterDetails}/>
      </article>
      <Node className="simple-house" icon={House} title="Consumo de la casa" value={watts(load)} status="Consumo instantáneo" accumulated={`Acumulado hoy: ${kwh(today.load)}`} details={houseDetails}/>
      <Node className="simple-grid" icon={RadioTower} title={isGenerator?'Generador de respaldo':`${gridLabel} · estado 1`} value={watts(Math.abs(grid))} status={gridStatus} accumulated={isGenerator?`Hoy: aporte del generador ${kwh(today.gridImport)}`:`Hoy: importado activo ${kwh(today.gridImport)} · exportado ${kwh(today.gridExport)}`} details={gridDetails}/>
      <svg className="simple-flow-lines" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
        <path className={`sf-line sf-solar ${!historical&&solar > 5 ? 'active' : ''}`} d="M270 145 C390 145 410 270 480 300"/>
        <path className={`sf-line sf-battery ${!historical&&Math.max(charge, discharge) > 5 ? 'active' : ''}`} d={charge > discharge ? "M480 325 C410 355 390 485 270 485" : "M270 485 C390 485 410 355 480 325"}/>
        <path className={`sf-line sf-house ${!historical&&load > 5 ? 'active' : ''}`} d="M535 300 C610 270 630 145 745 145"/>
        <path className={`sf-line sf-grid ${!historical&&Math.abs(grid) > 5 ? 'active' : ''}`} d={grid >= 0 ? "M745 485 C630 485 610 355 535 325" : "M535 325 C610 355 630 485 745 485"}/>
        {!historical&&solar > 5 && <circle className="sf-particle sf-particle-solar" r="5"><animateMotion dur="2.2s" repeatCount="indefinite" path="M270 145 C390 145 410 270 480 300"/></circle>}
        {!historical&&Math.max(charge, discharge) > 5 && <circle className="sf-particle sf-particle-battery" r="5"><animateMotion dur="2.6s" repeatCount="indefinite" path={charge > discharge ? "M480 325 C410 355 390 485 270 485" : "M270 485 C390 485 410 355 480 325"}/></circle>}
        {!historical&&load > 5 && <circle className="sf-particle sf-particle-house" r="5"><animateMotion dur="1.8s" repeatCount="indefinite" path="M535 300 C610 270 630 145 745 145"/></circle>}
        {!historical&&Math.abs(grid) > 5 && <circle className="sf-particle sf-particle-grid" r="5"><animateMotion dur="1.8s" repeatCount="indefinite" path={grid >= 0 ? "M745 485 C630 485 610 355 535 325" : "M535 325 C610 355 630 485 745 485"}/></circle>}
      </svg>
    </div>
  </section>;
}
