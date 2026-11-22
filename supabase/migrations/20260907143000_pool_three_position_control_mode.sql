-- Control persistente de tres posiciones para la automatización de piscina.
-- "off" es deliberadamente neutro: no modifica el estado físico de A1/A2.
alter table public.pool_solar_automation_configs
  add column if not exists control_mode text not null default 'off';

alter table public.pool_solar_automation_configs
  drop constraint if exists pool_solar_automation_configs_control_mode_check;
alter table public.pool_solar_automation_configs
  add constraint pool_solar_automation_configs_control_mode_check
  check (control_mode in ('manual','off','automatic'));

-- Conserva el comportamiento que estaba vigente antes de esta migración.
update public.pool_solar_automation_configs
set control_mode=case when enabled then 'automatic' else 'off' end;

update public.pool_solar_automation_configs c
set control_mode=case
  when s.runtime->>'manual_hold_active'='true' then 'manual'
  when c.enabled then 'automatic'
  else 'off'
end
from public.pool_solar_automation_states s
where s.site_id=c.site_id;

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
  v_actor uuid := nullif(p_payload->>'actor_user_id','')::uuid;
  v_result jsonb;
  v_runtime jsonb;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode='42501';
  end if;
  if p_operation <> 'set' then
    raise exception 'operación no permitida' using errcode='22023';
  end if;
  if v_site_id is null or v_mode not in ('manual','off','automatic') then
    raise exception 'modo de control inválido' using errcode='22023';
  end if;
  if not exists(select 1 from public.pool_solar_automation_configs where site_id=v_site_id) then
    raise exception 'automatización no configurada' using errcode='P0002';
  end if;

  update public.pool_solar_automation_configs
  set control_mode=v_mode,
      enabled=(v_mode='automatic'),
      updated_by=v_actor,
      updated_at=now()
  where site_id=v_site_id
  returning to_jsonb(public.pool_solar_automation_configs.*) into v_result;

  select coalesce(runtime,'{}'::jsonb) into v_runtime
  from public.pool_solar_automation_states where site_id=v_site_id;
  v_runtime:=coalesce(v_runtime,'{}'::jsonb) || jsonb_build_object(
    'control_mode',v_mode,
    'condition_a_since',null,
    'condition_b_since',null,
    'discharge_since',null,
    'last_blockers',case
      when v_mode='off' then jsonb_build_array('Modo apagado: Mi Solar no interviene en A1 ni A2')
      when v_mode='manual' then jsonb_build_array('Modo manual: secuencia bajo control directo del usuario')
      else '[]'::jsonb
    end
  );
  if v_mode <> 'manual' then
    v_runtime:=v_runtime || jsonb_build_object(
      'manual_hold_active',false,
      'manual_cycle_active',false,
      'manual_override_until',null
    );
  end if;

  insert into public.pool_solar_automation_states(site_id,phase,runtime,error_code,error_message)
  values(
    v_site_id,
    case v_mode when 'manual' then 'manual_override' when 'automatic' then 'waiting_surplus' else 'disabled' end,
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

create or replace function public.misolar_pool_mode_backend(
  p_operation text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path=''
as 'select private.misolar_pool_mode_backend(p_operation,p_payload)';

revoke all on function public.misolar_pool_mode_backend(text,jsonb) from public,authenticated;
grant execute on function public.misolar_pool_mode_backend(text,jsonb) to anon;
