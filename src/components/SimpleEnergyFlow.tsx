import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Battery, House, Info, PanelsTopLeft, RadioTower, Server, type LucideIcon } from 'lucide-react';
import type { DailyEnergy, HistoryRow, Realtime } from '../types';
import {
  batteryChargePower,
  batteryCurrent,
  batteryDischargePower,
  batterySoc,
  batteryVoltage,
  detectPvCount,
  effectiveGridPower,
  firstNumber,
  firstText,
  gridFrequency,
  gridPower,
  gridUsage,
  gridVoltage,
  heatsinkTemperature,
  inverterTemperature,
  kwh,
  loadPower,
  outputFrequency,
  outputVoltage,
  pvCurrent,
  pvPower,
  pvVoltage,
  watts
} from '../utils/energy';

type Detail = { label: string; value: string };

function cleanDetails(details: Detail[]) {
  return details.filter((item) => item.value !== '—' && item.value !== 'NaN' && item.value !== 'NaN W');
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
    const width = Math.min(340, viewportWidth - 24);
    const estimatedHeight = Math.min(420, 54 + items.length * 35);
    const below = rect.bottom + 10;
    const above = rect.top - estimatedHeight - 10;
    const top = below + estimatedHeight <= viewportHeight - 12 ? below : Math.max(12, above);
    const left = Math.min(Math.max(12, rect.right - width), viewportWidth - width - 12);
    setPosition({ top, left, width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
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

function Node({ className, icon: Icon, title, value, status, accumulated, details }: {
  className: string;
  icon: LucideIcon;
  title: string;
  value: string;
  status: string;
  accumulated: string;
  details: Detail[];
}) {
  return <article className={`simple-flow-node ${className}`} tabIndex={0}>
    <div className="simple-flow-node-main"><Icon size={30}/><div><small>{title}</small><strong>{value}</strong><span>{status}</span></div></div>
    <div className="simple-flow-daily">{accumulated}</div>
    <FlowDetails title={title} details={details}/>
  </article>;
}

export default function SimpleEnergyFlow({ data, history, today, gridLabel='Red activa' }: { data: Realtime; history: HistoryRow[]; today: DailyEnergy; gridLabel?:string }) {
  const p1 = pvPower(data, 1), p2 = pvPower(data, 2), solar = p1 + p2;
  const load = loadPower(data), rawGrid = gridPower(data), gridState=gridUsage(data), grid = effectiveGridPower(data);
  const charge = batteryChargePower(data), discharge = batteryDischargePower(data), soc = batterySoc(data);
  const pvCount = detectPvCount(data, history);
  const batteryStatus = charge > discharge ? `Cargando ${watts(charge)}` : discharge > 0 ? `Entregando ${watts(discharge)}` : 'En espera';
  const isGenerator=gridLabel==='Generador';
  const gridStatus = isGenerator?(grid>0?'Generador encendido':'Generador detenido'):(grid < 0 ? 'Exportando' : grid > 0 ? 'Importando' : 'Sin intercambio');
  const inverterPower = Math.max(load, solar + discharge);
  const solarStatus = pvCount === 2 ? `PV1 ${watts(p1)} · PV2 ${watts(p2)}` : 'Un MPPT detectado';
  const outV = outputVoltage(data);
  const outF = outputFrequency(data);
  const loadPercent = firstNumber(data, ['loadPercent', 'outputLoadPercent', 'acOutputLoadTotal']);
  const apparentPower = firstNumber(data, ['acOutputApparentPowerTotal', 'outputApparentPower', 'apparentPower']);
  const outputCurrent = firstNumber(data, ['acOutputCurrentR', 'acOutputCurrent', 'outputCurrent']) || (outV > 0 ? load / outV : 0);
  const mode = firstText(data, ['workMode', 'workModeName', 'mode']).value || '—';

  const solarDetails: Detail[] = [
    { label: 'PV1 potencia', value: watts(p1) },
    { label: 'PV1 voltaje', value: `${pvVoltage(data, 1).toFixed(1)} V` },
    { label: 'PV1 corriente', value: `${pvCurrent(data, 1).toFixed(2)} A` },
    ...(pvCount === 2 ? [
      { label: 'PV2 potencia', value: watts(p2) },
      { label: 'PV2 voltaje', value: `${pvVoltage(data, 2).toFixed(1)} V` },
      { label: 'PV2 corriente', value: `${pvCurrent(data, 2).toFixed(2)} A` }
    ] : []),
    { label: 'Generación hoy', value: kwh(today.solar) }
  ];

  const batteryDetails: Detail[] = [
    { label: 'Estado de carga', value: `${soc.toFixed(1)} %` },
    { label: 'Voltaje', value: `${batteryVoltage(data).toFixed(1)} V` },
    { label: 'Corriente', value: `${batteryCurrent(data).toFixed(2)} A` },
    { label: 'Carga instantánea', value: watts(charge) },
    { label: 'Descarga instantánea', value: watts(discharge) },
    { label: 'Cargada hoy', value: kwh(today.charge) },
    { label: 'Entregada hoy', value: kwh(today.discharge) }
  ];

  const houseDetails: Detail[] = [
    { label: 'Potencia activa', value: watts(load) },
    { label: 'Voltaje de salida', value: `${outV.toFixed(1)} V` },
    { label: 'Corriente de salida', value: `${outputCurrent.toFixed(2)} A` },
    { label: 'Frecuencia', value: `${outF.toFixed(1)} Hz` },
    { label: 'Carga del inversor', value: `${loadPercent.toFixed(1)} %` },
    { label: 'Potencia aparente', value: apparentPower ? `${Math.round(apparentPower).toLocaleString('es-CL')} VA` : '—' },
    { label: 'Consumo acumulado hoy', value: kwh(today.load) }
  ];

  const gridDetails: Detail[] = [
    { label: 'Potencia efectiva', value: watts(Math.abs(grid)) },
    { label: 'Lectura bruta', value: watts(Math.abs(rawGrid)) },
    { label: 'Uso efectivo (0/1)', value: gridState.status===null?'Inferido':String(gridState.status) },
    { label: 'Parámetro de estado', value: gridState.source },
    { label: 'Sentido', value: gridStatus },
    { label: 'Voltaje', value: `${gridVoltage(data).toFixed(1)} V` },
    { label: 'Frecuencia', value: `${gridFrequency(data).toFixed(1)} Hz` },
    { label: isGenerator?'Aporte del generador hoy':'Importado hoy', value: kwh(today.gridImport) },
    ...(!isGenerator?[{ label: 'Exportado hoy', value: kwh(today.gridExport) }]:[])
  ];

  const inverterDetails: Detail[] = [
    { label: 'Modo de trabajo', value: mode },
    { label: 'Potencia procesada', value: watts(inverterPower) },
    { label: 'Carga', value: `${loadPercent.toFixed(1)} %` },
    { label: 'Voltaje de salida', value: `${outV.toFixed(1)} V` },
    { label: 'Frecuencia de salida', value: `${outF.toFixed(1)} Hz` },
    { label: 'Temperatura interna', value: `${inverterTemperature(data).toFixed(1)} °C` },
    { label: 'Temperatura disipador', value: `${heatsinkTemperature(data).toFixed(1)} °C` }
  ];

  return <section className="panel simple-flow-panel">
    <header className="section-head"><div><small>Flujo instantáneo</small><h2>Tu sistema ahora</h2></div><span className="status-dot">{Object.keys(data).length ? 'En línea' : 'Esperando datos'}</span></header>
    <div className="simple-energy-flow">
      <Node className="simple-solar" icon={PanelsTopLeft} title={pvCount === 2 ? 'Paneles · PV1 + PV2' : 'Paneles'} value={watts(solar)} status={solarStatus} accumulated={`Hoy: ${kwh(today.solar)} · PV1 ${kwh(today.pv1)}${pvCount === 2 ? ` · PV2 ${kwh(today.pv2)}` : ''}`} details={solarDetails}/>
      <Node className="simple-battery" icon={Battery} title={`Batería · ${soc.toFixed(0)}%`} value={watts(Math.max(charge, discharge))} status={batteryStatus} accumulated={`Hoy: cargada ${kwh(today.charge)} · entregada ${kwh(today.discharge)}`} details={batteryDetails}/>
      <article className="simple-inverter" tabIndex={0}>
        <Server size={39}/><small>Inversor</small><strong>{watts(inverterPower)}</strong><span>Operando</span>
        <FlowDetails title="Inversor" details={inverterDetails}/>
      </article>
      <Node className="simple-house" icon={House} title="Consumo de la casa" value={watts(load)} status="Consumo instantáneo" accumulated={`Acumulado hoy: ${kwh(today.load)}`} details={houseDetails}/>
      <Node className="simple-grid" icon={RadioTower} title={isGenerator?'Generador de respaldo':`${gridLabel} · estado 1`} value={watts(Math.abs(grid))} status={gridStatus} accumulated={isGenerator?`Hoy: aporte del generador ${kwh(today.gridImport)}`:`Hoy: importado activo ${kwh(today.gridImport)} · exportado ${kwh(today.gridExport)}`} details={gridDetails}/>
      <svg className="simple-flow-lines" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
        <path className={`sf-line sf-solar ${solar > 5 ? 'active' : ''}`} d="M270 145 C390 145 410 270 480 300"/>
        <path className={`sf-line sf-battery ${Math.max(charge, discharge) > 5 ? 'active' : ''}`} d={charge > discharge ? "M480 325 C410 355 390 485 270 485" : "M270 485 C390 485 410 355 480 325"}/>
        <path className={`sf-line sf-house ${load > 5 ? 'active' : ''}`} d="M535 300 C610 270 630 145 745 145"/>
        <path className={`sf-line sf-grid ${Math.abs(grid) > 5 ? 'active' : ''}`} d={grid >= 0 ? "M745 485 C630 485 610 355 535 325" : "M535 325 C610 355 630 485 745 485"}/>
        {solar > 5 && <circle className="sf-particle sf-particle-solar" r="5"><animateMotion dur="2.2s" repeatCount="indefinite" path="M270 145 C390 145 410 270 480 300"/></circle>}
        {Math.max(charge, discharge) > 5 && <circle className="sf-particle sf-particle-battery" r="5"><animateMotion dur="2.6s" repeatCount="indefinite" path={charge > discharge ? "M480 325 C410 355 390 485 270 485" : "M270 485 C390 485 410 355 480 325"}/></circle>}
        {load > 5 && <circle className="sf-particle sf-particle-house" r="5"><animateMotion dur="1.8s" repeatCount="indefinite" path="M535 300 C610 270 630 145 745 145"/></circle>}
        {Math.abs(grid) > 5 && <circle className="sf-particle sf-particle-grid" r="5"><animateMotion dur="1.8s" repeatCount="indefinite" path={grid >= 0 ? "M745 485 C630 485 610 355 535 325" : "M535 325 C610 355 630 485 745 485"}/></circle>}
      </svg>
    </div>
  </section>;
}
