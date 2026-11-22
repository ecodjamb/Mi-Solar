import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluatePoolState,evaluatePoolWaterState,poolActiveAutomation,poolControlMode,poolSunsetSafety,poolTelemetryFrom,poolWaterControlMode,POOL_DEFAULTS} from '../server/poolSolarAutomation.js';

const config={...POOL_DEFAULTS,enabled:true,control_mode:'automatic'};
const t=(extra={})=>({valid:true,grid_power_w:0,battery_direction:'charging',battery_charge_w:3500,battery_discharge_w:0,battery_power_w:-3500,soc:70,solar_power_w:6000,...extra});
const d=(extra={})=>({a1_on:false,a2_on:false,...extra});
const now=Date.parse('2026-08-29T15:00:00Z');

const disconnectedGrid=poolTelemetryFrom({sampled_at:new Date(now).toISOString(),canonical:{time:{sampled_at_utc:new Date(now).toISOString()},grid:{active:false,power:342},battery:{power:-4500,soc:70},pv:{total_power:5200}}},now,420);
assert.equal(disconnectedGrid.grid_power_w,0,'red desconectada prevalece sobre el residuo crudo');
assert.equal(disconnectedGrid.grid_active,false);
assert.equal(disconnectedGrid.valid,true);

let result=evaluatePoolState(config,{phase:'waiting_surplus',runtime:{}},t(),d(),now);
assert.equal(result.phase,'validating_surplus');
result=evaluatePoolState(config,{phase:result.phase,runtime:result.runtime},t(),d(),now+479_000);
assert.equal(result.action,null,'A exige 8 minutos completos');
result=evaluatePoolState(config,{phase:result.phase,runtime:result.runtime},t(),d(),now+480_000);
assert.equal(result.action,'a1_then_a2');
assert.equal(result.reason,'Encendido Condición A');

result=evaluatePoolState(config,{phase:'waiting_surplus',runtime:{}},t({battery_charge_w:4500,soc:70}),d({a1_on:true}),now);
result=evaluatePoolState(config,{phase:result.phase,runtime:result.runtime},t({battery_charge_w:4500,soc:70}),d({a1_on:true}),now+180_000);
assert.equal(result.action,'a2_on');assert.equal(result.reason,'Encendido Condición B');

result=evaluatePoolState(config,{phase:'validating_surplus',runtime:{condition_a_since:new Date(now).toISOString()}},t({grid_power_w:500}),d(),now+300_000);
assert.equal(result.phase,'waiting_surplus');assert.equal(result.runtime.condition_a_since,null,'se reinicia el contador si falla una condición');
assert.match(result.runtime.last_blockers[0],/Red 500 W/);

result=evaluatePoolState(config,{phase:'active',runtime:{a2_started_at:new Date(now-1_000_000).toISOString()}},t({battery_direction:'discharging',battery_discharge_w:1200,battery_power_w:1200}),d({a1_on:true,a2_on:true}),now);
result=evaluatePoolState(config,{phase:result.phase,runtime:result.runtime},t({battery_direction:'discharging',battery_discharge_w:1200,battery_power_w:1200}),d({a1_on:true,a2_on:true}),now+180_000);
assert.equal(result.action,'a2_off');assert.match(result.reason,/descarga/);

result=evaluatePoolState(config,{phase:'active',runtime:{a2_started_at:new Date(now-1_000_000).toISOString()}},t(),d({a1_on:false,a2_on:true}),now);
assert.equal(result.action,'a2_off','A2 jamás permanece encendido sin A1 confirmado');
assert.equal(evaluatePoolState(config,{phase:'waiting_surplus',runtime:{}},{valid:false},d(),now).phase,'error_telemetry');
assert.equal(evaluatePoolState(config,{phase:'waiting_surplus',runtime:{manual_override_until:new Date(now+60_000).toISOString()}},t(),d(),now).phase,'manual_override');
const manualDisabled={...config,enabled:false};
result=evaluatePoolState(manualDisabled,{phase:'minimum_runtime',runtime:{discharge_since:new Date(now-180_000).toISOString()}},t({battery_direction:'discharging',battery_discharge_w:1500,battery_power_w:1500}),d({a1_on:true,a2_on:true}),now);
assert.equal(result.action,'a2_off','las protecciones siguen vigentes durante un ciclo manual con automático desactivado');

const neutral={...config,enabled:false,control_mode:'off'};
result=evaluatePoolState(neutral,{phase:'active',runtime:{a2_started_at:new Date(now-1_000_000).toISOString()}},{valid:false},d({a1_on:true,a2_on:true}),now);
assert.equal(result.phase,'disabled');
assert.equal(result.action,null,'Apagado es neutro y jamás cambia el estado físico de A1/A2');
assert.match(result.runtime.last_blockers[0],/no interviene/);
const persistentManual={...config,enabled:false,control_mode:'manual'};
result=evaluatePoolState(persistentManual,{phase:'manual_override',runtime:{}},{valid:false},d({a1_on:true,a2_on:true}),now);
assert.equal(result.phase,'manual_override');
assert.equal(result.action,null,'Manual no queda sujeto a condiciones solares ni apagado normal');
assert.equal(poolControlMode({enabled:true}), 'automatic','la configuración histórica conserva compatibilidad');
assert.equal(poolWaterControlMode(config),'off');
assert.equal(poolActiveAutomation(config),'heat');
assert.equal(poolActiveAutomation({...config,control_mode:'off',water_control_mode:'automatic'}),'water');

const waterConfig={...config,enabled:false,control_mode:'off',water_control_mode:'automatic'};
result=evaluatePoolWaterState(waterConfig,{phase:'waiting_surplus',runtime:{}},t(),d(),now);
assert.equal(result.phase,'validating_surplus');
result=evaluatePoolWaterState(waterConfig,{phase:result.phase,runtime:result.runtime},t(),d(),now+480_000);
assert.equal(result.action,'a1_on','solo bomba de agua usa la misma Condición A');
assert.equal(result.reason,'Encendido Condición A');
result=evaluatePoolWaterState(waterConfig,{phase:'active',runtime:{a1_started_by_automation:true,a1_started_at:new Date(now-1_000_000).toISOString()}},t({battery_direction:'discharging',battery_discharge_w:1200,battery_power_w:1200}),d({a1_on:true}),now);
result=evaluatePoolWaterState(waterConfig,{phase:result.phase,runtime:result.runtime},t({battery_direction:'discharging',battery_discharge_w:1200,battery_power_w:1200}),d({a1_on:true}),now+180_000);
assert.equal(result.action,'a1_off','solo bomba de agua reutiliza la protección por descarga');
result=evaluatePoolWaterState(waterConfig,{phase:'active',runtime:{a1_started_by_automation:false}},t(),d({a1_on:true}),now);
assert.equal(result.action,null,'no apaga una A1 encendida fuera de la automatización');
assert.equal(result.phase,'manual_override');
result=evaluatePoolWaterState({...waterConfig,water_control_mode:'off'},{phase:'active',runtime:{}},{valid:false},d({a1_on:true}),now);
assert.equal(result.action,null,'Apagado de la automatización de agua también es un punto neutro');

const sunsetEnabledConfig={...config,site_device_sn:'96342509120972',push_preferences:{...config.push_preferences,sunset_shutdown_enabled:true}};
const initialSunset=poolSunsetSafety(sunsetEnabledConfig,Date.parse('2026-09-01T16:00:00Z'));
assert.ok(initialSunset.sunset_at&&initialSunset.cutoff_at,'se calcula la puesta de sol local para la instalación');
assert.equal((Date.parse(initialSunset.sunset_at)-Date.parse(initialSunset.cutoff_at))/60_000,120);
const afterCutoff=Date.parse(initialSunset.cutoff_at)+1_000;
const activeSunset=poolSunsetSafety(sunsetEnabledConfig,afterCutoff);
assert.equal(activeSunset.active,true);
assert.equal(poolSunsetSafety({...config,site_device_sn:'96342509120972'},afterCutoff).active,false,'el corte horario queda apagado por defecto');
result=evaluatePoolState(config,{phase:'active',runtime:{a1_started_by_automation:false}}, {valid:false},d({a1_on:true,a2_on:true}),afterCutoff,activeSunset);
assert.equal(result.action,'sunset_shutdown','el corte diario prevalece incluso con telemetría atrasada o A1 encendido manualmente');
result=evaluatePoolState(config,{phase:'manual_override',runtime:{manual_hold_active:true}}, {valid:false},d({a1_on:true,a2_on:true}),afterCutoff,activeSunset);
assert.equal(result.phase,'manual_override','el switch manual persistente suspende el apagado automático');
assert.equal(result.action,null,'el circuito manual no se apaga solo');
result=evaluatePoolState(config,{phase:'manual_override',runtime:{manual_hold_active:true}}, {valid:false},d({a1_on:false,a2_on:true}),afterCutoff,activeSunset);
assert.equal(result.action,'a2_off','la protección de circulación prevalece sobre el modo manual');
result=evaluatePoolState(config,{phase:'manual_override',runtime:{manual_hold_active:true,manual_cycle_active:true}}, {valid:false},d({a1_on:false,a2_on:false}),afterCutoff,activeSunset);
assert.equal(result.runtime.manual_hold_active,false,'un indicador manual antiguo se limpia cuando Tuya confirma ambos contactores apagados');
assert.equal(result.runtime.manual_cycle_active,false);
result=evaluatePoolState(config,{phase:'waiting_surplus',runtime:{}},{valid:false},d(),afterCutoff,activeSunset);
assert.equal(result.phase,'sunset_shutdown');
assert.equal(result.action,null);

const sql=fs.readFileSync(new URL('../supabase/migrations/20260829120000_pool_solar_surplus_automation.sql',import.meta.url),'utf8');
assert.match(sql,/enabled boolean not null default false/);assert.match(sql,/enable row level security/g);assert.match(sql,/request_is_misolar/);assert.match(sql,/misolar_cron_secret/);assert.match(sql,/\* \* \* \* \*/);
const pushSql=fs.readFileSync(new URL('../supabase/migrations/20260829173000_pool_automation_manual_and_push.sql',import.meta.url),'utf8');
assert.match(pushSql,/push_preferences jsonb/);assert.match(pushSql,/circuit_started/);assert.match(pushSql,/s\.a2_on=true/);
const sunsetSql=fs.readFileSync(new URL('../supabase/migrations/20260901120000_pool_notification_history.sql',import.meta.url),'utf8');
assert.match(sunsetSql,/pool_a2_off/);assert.match(sunsetSql,/No cambia privilegios/);
assert.match(fs.readFileSync(new URL('../server/poolSolarAutomation.js',import.meta.url),'utf8'),/push_preferences\?\.sunset_shutdown_offset_minutes/);
const modeSql=fs.readFileSync(new URL('../supabase/migrations/20260907143000_pool_three_position_control_mode.sql',import.meta.url),'utf8');
assert.match(modeSql,/control_mode in \('manual','off','automatic'\)/);assert.match(modeSql,/request_is_misolar/);assert.match(modeSql,/Mi Solar no interviene/);
const waterModeSql=fs.readFileSync(new URL('../supabase/migrations/20260907163000_pool_water_only_automation.sql',import.meta.url),'utf8');
assert.match(waterModeSql,/water_control_mode in \('manual','off','automatic'\)/);assert.match(waterModeSql,/v_automation not in \('heat','water'\)/);assert.match(waterModeSql,/water_control_mode=case when v_mode<>'off' then 'off'/);assert.match(waterModeSql,/control_mode=case when v_mode<>'off' then 'off'/);assert.match(waterModeSql,/p_operation='enabled'/);
const poolUi=fs.readFileSync(new URL('../src/components/PoolSolarAutomation.tsx',import.meta.url),'utf8');
assert.match(poolUi,/Automatización bomba de calor piscina/);assert.match(poolUi,/Automatización bomba de agua piscina/);assert.match(poolUi,/body:JSON\.stringify\(\{automation,mode\}\)/);assert.match(poolUi,/Solo una automatización puede quedar activa/);
const apiSource=fs.readFileSync(new URL('../api/index.js',import.meta.url),'utf8');assert.match(apiSource,/pool-automation\\\/manual/);assert.match(apiSource,/pool-automation\\\/mode/);
console.log('pool solar automation tests passed');
