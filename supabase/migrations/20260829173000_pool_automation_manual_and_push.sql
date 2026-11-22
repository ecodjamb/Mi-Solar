-- Controles manuales y preferencias push para la automatización de piscina.
alter table public.pool_solar_automation_configs
  add column if not exists push_preferences jsonb not null default jsonb_build_object(
    'circuit_started',true,'a1_on',true,'a2_on',true,'a2_off',true,'a1_off',true,'errors',true
  );

alter table public.pool_solar_automation_configs
  drop constraint if exists pool_solar_automation_configs_push_preferences_check;
alter table public.pool_solar_automation_configs
  add constraint pool_solar_automation_configs_push_preferences_check check (
    jsonb_typeof(push_preferences)='object'
    and (push_preferences ?& array['circuit_started','a1_on','a2_on','a2_off','a1_off','errors'])
  );

create or replace function private.misolar_pool_automation_backend(
  p_operation text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_site_id bigint := nullif(p_payload->>'site_id','')::bigint;
  v_event_id bigint;
begin
  if not (select private.request_is_misolar()) then raise exception 'backend no autorizado' using errcode='42501'; end if;
  case p_operation
    when 'get' then
      select jsonb_build_object(
        'config',(select to_jsonb(c) from public.pool_solar_automation_configs c where c.site_id=v_site_id),
        'state',(select to_jsonb(s) from public.pool_solar_automation_states s where s.site_id=v_site_id),
        'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at desc),'[]'::jsonb) from (select * from public.pool_solar_automation_events where site_id=v_site_id order by occurred_at desc limit 100) e)
      ) into v_result;
    when 'enabled' then
      select coalesce(jsonb_agg(to_jsonb(c) order by c.site_id),'[]'::jsonb) into v_result
      from public.pool_solar_automation_configs c left join public.pool_solar_automation_states s on s.site_id=c.site_id
      where c.enabled=true or s.a2_on=true;
    when 'by_device' then
      select coalesce(jsonb_agg(to_jsonb(c) order by c.site_id),'[]'::jsonb) into v_result from public.pool_solar_automation_configs c where c.a1_device_id=p_payload->>'device_id' or c.a2_device_id=p_payload->>'device_id';
    when 'save_config' then
      insert into public.pool_solar_automation_configs(
        site_id,enabled,telemetry_provider,a1_device_id,a1_device_name,a1_function_code,a2_device_id,a2_device_name,a2_function_code,
        grid_zero_w,condition_a_charge_w,condition_a_soc,condition_a_confirm_seconds,condition_b_charge_w,condition_b_soc,condition_b_confirm_seconds,
        stop_soc,discharge_stop_w,discharge_confirm_seconds,a1_to_a2_delay_seconds,a2_to_a1_delay_seconds,a2_min_run_seconds,a2_cooldown_seconds,
        manual_override_seconds,telemetry_max_age_seconds,push_preferences,created_by,updated_by
      ) values (
        v_site_id,(p_payload->>'enabled')::boolean,coalesce(p_payload->>'telemetry_provider','isolar'),
        nullif(p_payload->>'a1_device_id',''),nullif(p_payload->>'a1_device_name',''),nullif(p_payload->>'a1_function_code',''),
        nullif(p_payload->>'a2_device_id',''),nullif(p_payload->>'a2_device_name',''),nullif(p_payload->>'a2_function_code',''),
        (p_payload->>'grid_zero_w')::integer,(p_payload->>'condition_a_charge_w')::integer,(p_payload->>'condition_a_soc')::integer,(p_payload->>'condition_a_confirm_seconds')::integer,
        (p_payload->>'condition_b_charge_w')::integer,(p_payload->>'condition_b_soc')::integer,(p_payload->>'condition_b_confirm_seconds')::integer,
        (p_payload->>'stop_soc')::integer,(p_payload->>'discharge_stop_w')::integer,(p_payload->>'discharge_confirm_seconds')::integer,
        (p_payload->>'a1_to_a2_delay_seconds')::integer,(p_payload->>'a2_to_a1_delay_seconds')::integer,(p_payload->>'a2_min_run_seconds')::integer,
        (p_payload->>'a2_cooldown_seconds')::integer,(p_payload->>'manual_override_seconds')::integer,(p_payload->>'telemetry_max_age_seconds')::integer,
        coalesce(p_payload->'push_preferences',jsonb_build_object('circuit_started',true,'a1_on',true,'a2_on',true,'a2_off',true,'a1_off',true,'errors',true)),
        nullif(p_payload->>'actor_user_id','')::uuid,nullif(p_payload->>'actor_user_id','')::uuid
      ) on conflict(site_id) do update set
        enabled=excluded.enabled,telemetry_provider=excluded.telemetry_provider,a1_device_id=excluded.a1_device_id,a1_device_name=excluded.a1_device_name,
        a1_function_code=excluded.a1_function_code,a2_device_id=excluded.a2_device_id,a2_device_name=excluded.a2_device_name,a2_function_code=excluded.a2_function_code,
        grid_zero_w=excluded.grid_zero_w,condition_a_charge_w=excluded.condition_a_charge_w,condition_a_soc=excluded.condition_a_soc,
        condition_a_confirm_seconds=excluded.condition_a_confirm_seconds,condition_b_charge_w=excluded.condition_b_charge_w,condition_b_soc=excluded.condition_b_soc,
        condition_b_confirm_seconds=excluded.condition_b_confirm_seconds,stop_soc=excluded.stop_soc,discharge_stop_w=excluded.discharge_stop_w,
        discharge_confirm_seconds=excluded.discharge_confirm_seconds,a1_to_a2_delay_seconds=excluded.a1_to_a2_delay_seconds,a2_to_a1_delay_seconds=excluded.a2_to_a1_delay_seconds,
        a2_min_run_seconds=excluded.a2_min_run_seconds,a2_cooldown_seconds=excluded.a2_cooldown_seconds,manual_override_seconds=excluded.manual_override_seconds,
        telemetry_max_age_seconds=excluded.telemetry_max_age_seconds,push_preferences=excluded.push_preferences,updated_by=excluded.updated_by,updated_at=now()
      returning to_jsonb(public.pool_solar_automation_configs.*) into v_result;
      insert into public.pool_solar_automation_states(site_id,phase,runtime) values(v_site_id,case when (p_payload->>'enabled')::boolean then 'waiting_surplus' else 'disabled' end,'{}'::jsonb)
      on conflict(site_id) do update set phase=case when (p_payload->>'enabled')::boolean then case when public.pool_solar_automation_states.phase='disabled' then 'waiting_surplus' else public.pool_solar_automation_states.phase end else 'disabled' end,updated_at=now();
    when 'claim' then
      insert into public.pool_solar_automation_states(site_id,phase) values(v_site_id,'waiting_surplus') on conflict do nothing;
      update public.pool_solar_automation_states set lock_until=now()+interval '50 seconds',updated_at=now() where site_id=v_site_id and (lock_until is null or lock_until<now()) returning to_jsonb(public.pool_solar_automation_states.*) into v_result;
    when 'release' then
      update public.pool_solar_automation_states set lock_until=null,updated_at=now() where site_id=v_site_id returning to_jsonb(public.pool_solar_automation_states.*) into v_result;
    when 'save_state' then
      insert into public.pool_solar_automation_states(site_id,phase,runtime,telemetry,a1_on,a2_on,last_evaluated_at,last_telemetry_at,error_code,error_message)
      values(v_site_id,p_payload->>'phase',coalesce(p_payload->'runtime','{}'::jsonb),coalesce(p_payload->'telemetry','{}'::jsonb),nullif(p_payload->>'a1_on','')::boolean,nullif(p_payload->>'a2_on','')::boolean,now(),nullif(p_payload->>'last_telemetry_at','')::timestamptz,nullif(p_payload->>'error_code',''),nullif(p_payload->>'error_message',''))
      on conflict(site_id) do update set phase=excluded.phase,runtime=excluded.runtime,telemetry=excluded.telemetry,a1_on=excluded.a1_on,a2_on=excluded.a2_on,last_evaluated_at=excluded.last_evaluated_at,last_telemetry_at=excluded.last_telemetry_at,error_code=excluded.error_code,error_message=excluded.error_message,updated_at=now()
      returning to_jsonb(public.pool_solar_automation_states.*) into v_result;
    when 'manual_override' then
      insert into public.pool_solar_automation_states(site_id,phase,runtime) values(v_site_id,'manual_override',jsonb_build_object('manual_override_until',p_payload->>'until'))
      on conflict(site_id) do update set phase='manual_override',runtime=jsonb_set(public.pool_solar_automation_states.runtime,'{manual_override_until}',to_jsonb(p_payload->>'until'),true),updated_at=now() returning to_jsonb(public.pool_solar_automation_states.*) into v_result;
    when 'event' then
      insert into public.pool_solar_automation_events(site_id,event_key,occurred_at,action,reason,initiated_by,success,soc,solar_power_w,battery_power_w,grid_power_w,a1_on,a2_on,details)
      values(v_site_id,p_payload->>'event_key',coalesce(nullif(p_payload->>'occurred_at','')::timestamptz,now()),p_payload->>'action',p_payload->>'reason',coalesce(p_payload->>'initiated_by','automation'),coalesce((p_payload->>'success')::boolean,true),nullif(p_payload->>'soc','')::numeric,nullif(p_payload->>'solar_power_w','')::numeric,nullif(p_payload->>'battery_power_w','')::numeric,nullif(p_payload->>'grid_power_w','')::numeric,nullif(p_payload->>'a1_on','')::boolean,nullif(p_payload->>'a2_on','')::boolean,coalesce(p_payload->'details','{}'::jsonb))
      on conflict(event_key) do nothing returning id into v_event_id;
      v_result:=jsonb_build_object('inserted',v_event_id is not null,'id',v_event_id);
    else raise exception 'operación no permitida' using errcode='22023';
  end case;
  return coalesce(v_result,'null'::jsonb);
end;
$$;

revoke all on function private.misolar_pool_automation_backend(text,jsonb) from public,authenticated;
grant execute on function private.misolar_pool_automation_backend(text,jsonb) to anon;
