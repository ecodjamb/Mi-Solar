-- The former views executed their window function over the full telemetry
-- archive before applying the requested date range. On a growing archive that
-- caused statement timeouts. This bounded RPC reads only the requested site
-- and period (plus one hour for the preceding interval).
create or replace function public.misolar_archive_series_backend(
  p_site_id bigint,
  p_start timestamptz,
  p_end timestamptz,
  p_resolution text default 'hour'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_resolution text := case when p_resolution = 'day' then 'day' else 'hour' end;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode = '42501';
  end if;
  if p_end <= p_start or p_end - p_start > interval '2 years' then
    raise exception 'rango de archivo inválido' using errcode = '22023';
  end if;

  with input as (
    select *
    from public.energy_samples
    where site_id = p_site_id
      and sample_at >= p_start - interval '1 hour'
      and sample_at < p_end
  ), ordered as (
    select
      sample_at,
      date_trunc(v_resolution, sample_at) bucket_at,
      solar_w, pv1_w, pv2_w, load_w,
      case when grid_active is false then 0 else grid_w end effective_grid_w,
      grid_active, battery_charge_w, battery_discharge_w, battery_soc,
      lag(sample_at) over (order by sample_at) previous_at,
      lag(solar_w) over (order by sample_at) previous_solar_w,
      lag(pv1_w) over (order by sample_at) previous_pv1_w,
      lag(pv2_w) over (order by sample_at) previous_pv2_w,
      lag(load_w) over (order by sample_at) previous_load_w,
      lag(case when grid_active is false then 0 else grid_w end) over (order by sample_at) previous_grid_w,
      lag(battery_charge_w) over (order by sample_at) previous_charge_w,
      lag(battery_discharge_w) over (order by sample_at) previous_discharge_w
    from input
  ), gaps as (
    select *, extract(epoch from (sample_at - previous_at)) gap_seconds
    from ordered
  ), limits as (
    select bucket_at,
      least(1800::numeric, greatest(360::numeric, percentile_disc(0.5) within group (order by gap_seconds) * 3)) maximum_gap_seconds
    from gaps
    where gap_seconds > 0 and gap_seconds <= 3600
    group by bucket_at
  ), valid as (
    select gaps.*,
      case when gap_seconds > 0 and gap_seconds <= limits.maximum_gap_seconds then gap_seconds / 3600.0 else 0 end interval_hours
    from gaps left join limits using (bucket_at)
  ), buckets as (
    select
      bucket_at,
      sum(interval_hours) coverage_hours,
      sum(((solar_w + previous_solar_w) / 2.0) * interval_hours) solar_wh,
      sum(((pv1_w + previous_pv1_w) / 2.0) * interval_hours) pv1_wh,
      sum(((pv2_w + previous_pv2_w) / 2.0) * interval_hours) pv2_wh,
      sum(((load_w + previous_load_w) / 2.0) * interval_hours) load_wh,
      sum(((effective_grid_w + previous_grid_w) / 2.0) * interval_hours) grid_wh,
      sum(((battery_charge_w + previous_charge_w) / 2.0) * interval_hours) charge_wh,
      sum(((battery_discharge_w + previous_discharge_w) / 2.0) * interval_hours) discharge_wh,
      bool_or(grid_active) grid_active,
      avg(battery_soc) battery_soc,
      count(*)::integer samples
    from valid
    where sample_at >= p_start and sample_at < p_end
    group by bucket_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket_at', bucket_at,
    'solar_w', solar_wh / nullif(coverage_hours, 0),
    'pv1_w', pv1_wh / nullif(coverage_hours, 0),
    'pv2_w', pv2_wh / nullif(coverage_hours, 0),
    'load_w', load_wh / nullif(coverage_hours, 0),
    'grid_w', grid_wh / nullif(coverage_hours, 0),
    'grid_active', grid_active,
    'battery_charge_w', charge_wh / nullif(coverage_hours, 0),
    'battery_discharge_w', discharge_wh / nullif(coverage_hours, 0),
    'battery_soc', battery_soc,
    'samples', samples,
    'coverage_hours', coverage_hours
  ) order by bucket_at), '[]'::jsonb)
  into v_result
  from buckets;

  return v_result;
end;
$$;

revoke all on function public.misolar_archive_series_backend(bigint,timestamptz,timestamptz,text) from public, authenticated;
grant execute on function public.misolar_archive_series_backend(bigint,timestamptz,timestamptz,text) to anon;
