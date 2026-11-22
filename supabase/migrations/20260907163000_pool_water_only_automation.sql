-- Segunda automatización mutuamente excluyente para operar únicamente A1.
alter table public.pool_solar_automation_configs
  add column if not exists water_control_mode text not null default 'off';

alter table public.pool_solar_automation_configs
  drop constraint if exists pool_solar_automation_configs_water_control_mode_check;
alter table public.pool_solar_automation_configs
  add constraint pool_solar_automation_configs_water_control_mode_check
  check (water_control_mode in ('manual','off','automatic'));

create or replace function private.misolar_pool_mode_backend(
  p_operation text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_site_id bigint := nullif(p_payload->>'site_id','')::bigint;
  v_mode text := nullif(p_payload->>'mode','');
  v_automation text := coalesce(nullif(p_payload->>'automation',''),'heat');
  v_actor uuid := nullif(p_payload->>'actor_user_id','')::uuid;
  v_result jsonb;
  v_runtime jsonb;
  v_heat_mode text;
  v_water_mode text;
  v_active text;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode='42501';
  end if;

  if p_operation='enabled' then
    select coalesce(jsonb_agg(to_jsonb(c) order by c.site_id),'[]'::jsonb)
    into v_result
    from public.pool_solar_automation_configs c
    where c.control_mode<>'off' or c.water_control_mode<>'off';
    return v_result;
  end if;

  if p_operation<>'set' then
    raise exception 'operación no permitida' using errcode='22023';
  end if;
  if v_site_id is null
     or v_mode not in ('manual','off','automatic')
     or v_automation not in ('heat','water') then
    raise exception 'modo de control inválido' using errcode='22023';
  end if;
  if not exists(select 1 from public.pool_solar_automation_configs where site_id=v_site_id) then
    raise exception 'automatización no configurada' using errcode='P0002';
  end if;

  if v_automation='heat' then
    update public.pool_solar_automation_configs
    set control_mode=v_mode,
        water_control_mode=case when v_mode<>'off' then 'off' else water_control_mode end,
        enabled=(v_mode='automatic'),
        updated_by=v_actor,
        updated_at=now()
    where site_id=v_site_id
    returning to_jsonb(public.pool_solar_automation_configs.*) into v_result;
  else
    update public.pool_solar_automation_configs
    set water_control_mode=v_mode,
        control_mode=case when v_mode<>'off' then 'off' else control_mode end,
        enabled=case when v_mode<>'off' then false else control_mode='automatic' end,
        updated_by=v_actor,
        updated_at=now()
    where site_id=v_site_id
    returning to_jsonb(public.pool_solar_automation_configs.*) into v_result;
  end if;

  select control_mode,water_control_mode
  into v_heat_mode,v_water_mode
  from public.pool_solar_automation_configs where site_id=v_site_id;
  v_active:=case when v_water_mode<>'off' then 'water' when v_heat_mode<>'off' then 'heat' else 'off' end;

  select coalesce(runtime,'{}'::jsonb) into v_runtime
  from public.pool_solar_automation_states where site_id=v_site_id;
  v_runtime:=coalesce(v_runtime,'{}'::jsonb) || jsonb_build_object(
    'control_mode',v_heat_mode,
    'water_control_mode',v_water_mode,
    'active_automation',v_active,
    'condition_a_since',null,
    'condition_b_since',null,
    'discharge_since',null,
    'last_blockers',case
      when v_active='off' then jsonb_build_array('Automatizaciones apagadas: Mi Solar no interviene en A1 ni A2')
      when v_active='water' and v_water_mode='manual' then jsonb_build_array('Bomba de agua en modo manual')
      when v_active='heat' and v_heat_mode='manual' then jsonb_build_array('Bomba de calor en modo manual')
      else '[]'::jsonb
    end,
    'manual_hold_active',case
      when v_active='water' then v_water_mode='manual'
      when v_active='heat' then v_heat_mode='manual'
      else false
    end,
    'manual_cycle_active',case
      when v_active='water' then v_water_mode='manual'
      when v_active='heat' then v_heat_mode='manual'
      else false
    end,
    'manual_override_until',null
  );

  insert into public.pool_solar_automation_states(site_id,phase,runtime,error_code,error_message)
  values(
    v_site_id,
    case
      when (v_active='water' and v_water_mode='manual') or (v_active='heat' and v_heat_mode='manual') then 'manual_override'
      when v_active<>'off' then 'waiting_surplus'
      else 'disabled'
    end,
    v_runtime,
    null,
    null
  )
  on conflict(site_id) do update set
    phase=excluded.phase,
    runtime=excluded.runtime,
    error_code=null,
    error_message=null,
    updated_at=now();

  return v_result;
end;
$$;

revoke all on function private.misolar_pool_mode_backend(text,jsonb) from public,authenticated;
grant execute on function private.misolar_pool_mode_backend(text,jsonb) to anon;
