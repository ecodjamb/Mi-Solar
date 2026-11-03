-- Applied migration 20261103101311: precomputed_energy_series_and_visible_activity

create materialized view private.energy_hourly_rollup as select * from public.energy_hourly;
create unique index energy_hourly_rollup_key on private.energy_hourly_rollup(site_id,bucket_at);
create materialized view private.energy_daily_rollup as select * from public.energy_daily;
create unique index energy_daily_rollup_key on private.energy_daily_rollup(site_id,bucket_at);
revoke all on private.energy_hourly_rollup,private.energy_daily_rollup from public,anon,authenticated;
create table private.misolar_visible_activity (id boolean primary key default true check(id),last_seen_at timestamptz not null);
alter table private.misolar_visible_activity enable row level security;
revoke all on private.misolar_visible_activity from public,anon,authenticated;
create function private.misolar_app_is_visible() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.misolar_visible_activity where last_seen_at>now()-interval '6 minutes');
$$;
revoke all on function private.misolar_app_is_visible() from public,anon,authenticated;
create function private.misolar_touch_visible_backend() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.request_is_misolar() then raise exception 'backend no autorizado' using errcode='42501'; end if;
 insert into private.misolar_visible_activity(id,last_seen_at) values(true,now())
 on conflict(id) do update set last_seen_at=excluded.last_seen_at;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function private.misolar_touch_visible_backend() from public;
grant execute on function private.misolar_touch_visible_backend() to anon,service_role;
create function public.misolar_touch_visible_backend() returns jsonb language sql set search_path='' as $$select private.misolar_touch_visible_backend()$$;
revoke all on function public.misolar_touch_visible_backend() from public;
grant execute on function public.misolar_touch_visible_backend() to anon,service_role;
create function private.misolar_energy_series_backend(p_site_id bigint,p_from timestamptz,p_to timestamptz,p_resolution text default 'hour') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.request_is_misolar() then raise exception 'backend no autorizado' using errcode='42501'; end if;
 if p_to<=p_from or p_to-p_from>interval '400 days' then raise exception 'rango inválido' using errcode='22023'; end if;
 if p_resolution='day' then
 select coalesce(jsonb_agg(to_jsonb(x) order by x.bucket_at),'[]'::jsonb) into result
 from (select * from private.energy_daily_rollup where site_id=p_site_id and bucket_at>=p_from and bucket_at<p_to order by bucket_at limit 10000) x;
 elsif p_resolution='hour' then
 select coalesce(jsonb_agg(to_jsonb(x) order by x.bucket_at),'[]'::jsonb) into result
 from (select * from private.energy_hourly_rollup where site_id=p_site_id and bucket_at>=p_from and bucket_at<p_to order by bucket_at limit 10000) x;
 else raise exception 'resolución inválida' using errcode='22023'; end if;
 return result;
end $$;
revoke all on function private.misolar_energy_series_backend(bigint,timestamptz,timestamptz,text) from public;
grant execute on function private.misolar_energy_series_backend(bigint,timestamptz,timestamptz,text) to anon,service_role;
create function public.misolar_energy_series_backend(p_site_id bigint,p_from timestamptz,p_to timestamptz,p_resolution text default 'hour') returns jsonb language sql set search_path='' as $$select private.misolar_energy_series_backend(p_site_id,p_from,p_to,p_resolution)$$;
revoke all on function public.misolar_energy_series_backend(bigint,timestamptz,timestamptz,text) from public;
grant execute on function public.misolar_energy_series_backend(bigint,timestamptz,timestamptz,text) to anon,service_role;
select cron.schedule('misolar-energy-rollups-15m','3-59/15 * * * *','refresh materialized view concurrently private.energy_hourly_rollup; refresh materialized view concurrently private.energy_daily_rollup;');
;

-- Applied migration 20261103101516: adaptive_poll_policy_backend

alter table private.misolar_visible_activity add column last_monitor_at timestamptz;
create function private.misolar_poll_policy_backend(p_monitor boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_visible boolean; v_seconds integer; v_run boolean:=true;
begin
 if not private.request_is_misolar() then raise exception 'backend no autorizado' using errcode='42501'; end if;
 v_visible:=private.misolar_app_is_visible();
 v_seconds:=case when v_visible then 300 else 900 end;
 if p_monitor then
   insert into private.misolar_visible_activity(id,last_seen_at) values(true,'1970-01-01') on conflict do nothing;
   update private.misolar_visible_activity set last_monitor_at=now()
    where id and (last_monitor_at is null or last_monitor_at<=now()-make_interval(secs=>v_seconds));
   v_run:=found;
 end if;
 return jsonb_build_object('visible',v_visible,'minimumSeconds',v_seconds,'runMonitor',v_run);
end $$;
revoke all on function private.misolar_poll_policy_backend(boolean) from public;
grant execute on function private.misolar_poll_policy_backend(boolean) to anon,service_role;
create function public.misolar_poll_policy_backend(p_monitor boolean default false) returns jsonb language sql set search_path='' as $$select private.misolar_poll_policy_backend(p_monitor)$$;
revoke all on function public.misolar_poll_policy_backend(boolean) from public;
grant execute on function public.misolar_poll_policy_backend(boolean) to anon,service_role;
;
