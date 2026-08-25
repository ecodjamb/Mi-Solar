alter table public.water_meter_readings
  add column if not exists meter_cycle integer not null default 1,
  add column if not exists is_meter_change boolean not null default false;

alter table public.water_meter_readings
  drop constraint if exists water_meter_readings_meter_cycle_check;

alter table public.water_meter_readings
  add constraint water_meter_readings_meter_cycle_check
  check (meter_cycle >= 1);

create index if not exists water_meter_readings_period_cycle_time_idx
  on public.water_meter_readings (period_id, meter_cycle, reading_at);

comment on column public.water_meter_readings.meter_cycle is
  'Secuencia del medidor físico dentro del período. Aumenta cuando el contador es reemplazado o reiniciado.';

comment on column public.water_meter_readings.is_meter_change is
  'Marca la primera lectura de un medidor nuevo; no se resta contra la lectura del medidor anterior.';
