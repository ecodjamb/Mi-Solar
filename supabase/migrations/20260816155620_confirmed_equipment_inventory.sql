begin;

delete from public.equipment_assets
where site_id in (
  select id from public.solar_sites
  where device_sn in ('96342509120972', '96322507118828')
);

insert into public.equipment_assets
  (site_id, category, brand, model, quantity, unit_power_w, capacity_kwh, notes)
select id, 'panel', 'OSDA', 'ODA620-33V-MHDRz', 10, 620::numeric, null::numeric,
  'Vmp 41,46 V · Imp 14,96 A · Voc 48,78 V · Isc 15,89 A.'
from public.solar_sites where device_sn = '96342509120972'
union all
select id, 'panel', 'Ulica Solar', 'TOPCon N-Type', 4, 620::numeric, null::numeric,
  'Paneles N-Type de 620 W. Potencia total del grupo: 2,48 kWp.'
from public.solar_sites where device_sn = '96342509120972'
union all
select id, 'inverter', 'Neutral', 'Axpert VM II Premium+ 12K 48V', 1, 12000::numeric, null::numeric,
  'Inversor de 12 kW · sistema de 48 V · 2 MPPT.'
from public.solar_sites where device_sn = '96342509120972'
union all
select id, 'battery', 'Pylontech', 'UF5000', 2, null::numeric, 5.12::numeric,
  '5,12 kWh nominales por unidad · almacenamiento nominal total: 10,24 kWh.'
from public.solar_sites where device_sn = '96342509120972'
union all
select id, 'panel', 'JA Solar', 'JAM66D45-LB-615', 3, 615::numeric, null::numeric,
  'Paneles N-Type bifaciales · 3 unidades conectadas en serie · potencia FV total: 1,845 kWp.'
from public.solar_sites where device_sn = '96322507118828'
union all
select id, 'inverter', '', 'VM II Premium+ 4.2K', 1, 4200::numeric, null::numeric,
  'Potencia 4.200 W · banco de 24 V · entrada solar máxima 5.000 W · MPPT 30–400 V · Voc FV máximo 450 V.'
from public.solar_sites where device_sn = '96322507118828'
union all
select id, 'battery', 'NIMAC', 'NM12.8-150L LiFePO₄', 2, null::numeric, 1.92::numeric,
  'Cada batería: 12,8 V y 150 Ah · conexión en serie · banco resultante: 25,6 V y 150 Ah · energía nominal total aproximada: 3,84 kWh.'
from public.solar_sites where device_sn = '96322507118828';

commit;
