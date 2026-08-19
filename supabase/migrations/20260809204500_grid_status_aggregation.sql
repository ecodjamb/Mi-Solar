drop view if exists public.energy_hourly;
drop view if exists public.energy_daily;

create view public.energy_hourly with (security_invoker = true) as
select site_id,date_trunc('hour',sample_at) bucket_at,
  avg(solar_w)::numeric(12,2) solar_w,
  avg(load_w)::numeric(12,2) load_w,
  avg(case when grid_active is false then 0 else grid_w end)::numeric(12,2) grid_w,
  bool_or(grid_active) grid_active,
  avg(battery_charge_w)::numeric(12,2) battery_charge_w,
  avg(battery_discharge_w)::numeric(12,2) battery_discharge_w,
  avg(battery_soc)::numeric(8,2) battery_soc,
  count(*)::integer samples
from public.energy_samples group by site_id,date_trunc('hour',sample_at);

create view public.energy_daily with (security_invoker = true) as
select site_id,date_trunc('day',sample_at) bucket_at,
  avg(solar_w)::numeric(12,2) solar_w,
  avg(load_w)::numeric(12,2) load_w,
  avg(case when grid_active is false then 0 else grid_w end)::numeric(12,2) grid_w,
  bool_or(grid_active) grid_active,
  avg(battery_charge_w)::numeric(12,2) battery_charge_w,
  avg(battery_discharge_w)::numeric(12,2) battery_discharge_w,
  avg(battery_soc)::numeric(8,2) battery_soc,
  count(*)::integer samples
from public.energy_samples group by site_id,date_trunc('day',sample_at);

revoke all on public.energy_hourly from public,anon,authenticated;
revoke all on public.energy_daily from public,anon,authenticated;
grant select on public.energy_hourly to anon;
grant select on public.energy_daily to anon;
