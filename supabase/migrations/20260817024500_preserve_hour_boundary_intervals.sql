-- Hourly consumers (including Costos) also use the duration truly represented by
-- stored samples, so the first and last partial hour are never extrapolated.
drop view if exists public.energy_hourly;

create view public.energy_hourly with (security_invoker = true) as
with ordered as (
  select
    site_id,
    sample_at,
    date_trunc('hour', sample_at) as bucket_at,
    solar_w,
    pv1_w,
    pv2_w,
    load_w,
    case when grid_active is false then 0 else grid_w end as effective_grid_w,
    grid_active,
    battery_charge_w,
    battery_discharge_w,
    battery_soc,
    lag(sample_at) over hour_window as previous_at,
    lag(solar_w) over hour_window as previous_solar_w,
    lag(pv1_w) over hour_window as previous_pv1_w,
    lag(pv2_w) over hour_window as previous_pv2_w,
    lag(load_w) over hour_window as previous_load_w,
    lag(case when grid_active is false then 0 else grid_w end) over hour_window as previous_grid_w,
    lag(battery_charge_w) over hour_window as previous_charge_w,
    lag(battery_discharge_w) over hour_window as previous_discharge_w
  from public.energy_samples
  window hour_window as (
    partition by site_id
    order by sample_at
  )
), gaps as (
  select *, extract(epoch from (sample_at - previous_at)) as gap_seconds
  from ordered
), limits as (
  select
    site_id,
    bucket_at,
    least(
      1800::numeric,
      greatest(
        360::numeric,
        percentile_disc(0.5) within group (order by gap_seconds) * 3
      )
    ) as maximum_gap_seconds
  from gaps
  where gap_seconds > 0 and gap_seconds <= 3600
  group by site_id, bucket_at
), valid_intervals as (
  select
    gaps.*,
    case
      when gap_seconds > 0 and gap_seconds <= limits.maximum_gap_seconds
        then gap_seconds / 3600.0
      else 0
    end as interval_hours
  from gaps
  left join limits using (site_id, bucket_at)
), hourly as (
  select
    site_id,
    bucket_at,
    sum(interval_hours) as coverage_hours,
    sum(((solar_w + previous_solar_w) / 2.0) * interval_hours) as solar_wh,
    sum(((pv1_w + previous_pv1_w) / 2.0) * interval_hours) as pv1_wh,
    sum(((pv2_w + previous_pv2_w) / 2.0) * interval_hours) as pv2_wh,
    sum(((load_w + previous_load_w) / 2.0) * interval_hours) as load_wh,
    sum(((effective_grid_w + previous_grid_w) / 2.0) * interval_hours) as grid_wh,
    sum(((battery_charge_w + previous_charge_w) / 2.0) * interval_hours) as charge_wh,
    sum(((battery_discharge_w + previous_discharge_w) / 2.0) * interval_hours) as discharge_wh,
    bool_or(grid_active) as grid_active,
    avg(battery_soc) as battery_soc,
    count(*)::integer as samples
  from valid_intervals
  group by site_id, bucket_at
)
select
  site_id,
  bucket_at,
  (solar_wh / nullif(coverage_hours, 0))::numeric(12,2) as solar_w,
  (pv1_wh / nullif(coverage_hours, 0))::numeric(12,2) as pv1_w,
  (pv2_wh / nullif(coverage_hours, 0))::numeric(12,2) as pv2_w,
  (load_wh / nullif(coverage_hours, 0))::numeric(12,2) as load_w,
  (grid_wh / nullif(coverage_hours, 0))::numeric(12,2) as grid_w,
  grid_active,
  (charge_wh / nullif(coverage_hours, 0))::numeric(12,2) as battery_charge_w,
  (discharge_wh / nullif(coverage_hours, 0))::numeric(12,2) as battery_discharge_w,
  battery_soc::numeric(8,2) as battery_soc,
  samples,
  coverage_hours::numeric(8,4) as coverage_hours
from hourly;

revoke all on public.energy_hourly from public, anon, authenticated;
grant select on public.energy_hourly to anon;

comment on view public.energy_hourly is
  'Hourly averages weighted by valid sample intervals. Multiply power columns by coverage_hours to obtain Wh.';
