-- Pausa manual global por proveedor. Conserva credenciales, sesiones e
-- históricos; solo impide nuevas salidas al proveedor hasta reanudarlas.

create table if not exists public.provider_query_controls (
  provider text primary key check (provider in ('isolar', 'watchpower')),
  paused boolean not null default false,
  paused_at timestamptz,
  paused_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.provider_query_controls enable row level security;
revoke all on table public.provider_query_controls from public, anon, authenticated;

insert into public.provider_query_controls(provider, paused)
values ('isolar', false), ('watchpower', false)
on conflict(provider) do nothing;

create or replace function private.misolar_provider_query_control_backend(
  p_provider text,
  p_paused boolean,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode = '42501';
  end if;
  if p_provider not in ('isolar', 'watchpower') then
    raise exception 'proveedor no válido' using errcode = '22023';
  end if;

  insert into public.provider_query_controls(provider, paused, paused_at, paused_by, updated_at)
  values (p_provider, p_paused, case when p_paused then now() else null end,
          case when p_paused then p_actor_user_id else null end, now())
  on conflict(provider) do update
    set paused = excluded.paused, paused_at = excluded.paused_at,
        paused_by = excluded.paused_by, updated_at = now()
  returning jsonb_build_object('provider', provider, 'paused', paused,
    'pausedAt', paused_at, 'updatedAt', updated_at) into v_result;

  if p_paused then
    update public.provider_accounts
       set sync_lock_until = null, sync_lock_token = null, updated_at = now()
     where provider = p_provider;
  end if;

  insert into public.credential_audit_events(
    site_id, provider_account_id, actor_user_id, action, success, metadata
  )
  select a.site_id, a.id, p_actor_user_id,
         case when p_paused then 'provider_queries_paused' else 'provider_queries_resumed' end,
         true, jsonb_build_object('provider', p_provider)
  from public.provider_accounts a where a.provider = p_provider;

  return v_result;
end;
$$;

create or replace function private.misolar_provider_query_control_status_backend(p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode = '42501';
  end if;
  select jsonb_build_object('provider', c.provider, 'paused', c.paused,
    'pausedAt', c.paused_at, 'updatedAt', c.updated_at)
  into v_result from public.provider_query_controls c where c.provider = p_provider;
  return coalesce(v_result, jsonb_build_object('provider', p_provider, 'paused', false));
end;
$$;

revoke all on function private.misolar_provider_query_control_backend(text,boolean,uuid) from public, authenticated;
revoke all on function private.misolar_provider_query_control_status_backend(text) from public, authenticated;
grant execute on function private.misolar_provider_query_control_backend(text,boolean,uuid) to anon;
grant execute on function private.misolar_provider_query_control_status_backend(text) to anon;

create or replace function public.misolar_provider_query_control_backend(
  p_provider text, p_paused boolean, p_actor_user_id uuid default null
)
returns jsonb language sql security invoker set search_path = ''
as 'select private.misolar_provider_query_control_backend(p_provider,p_paused,p_actor_user_id)';

create or replace function public.misolar_provider_query_control_status_backend(p_provider text)
returns jsonb language sql security invoker set search_path = ''
as 'select private.misolar_provider_query_control_status_backend(p_provider)';

revoke all on function public.misolar_provider_query_control_backend(text,boolean,uuid) from public, authenticated;
revoke all on function public.misolar_provider_query_control_status_backend(text) from public, authenticated;
grant execute on function public.misolar_provider_query_control_backend(text,boolean,uuid) to anon;
grant execute on function public.misolar_provider_query_control_status_backend(text) to anon;

create or replace function private.misolar_provider_sync_lease_backend(
  p_site_id bigint, p_provider text, p_minimum_seconds integer default 60
)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_token uuid := gen_random_uuid(); v_claimed text;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode = '42501';
  end if;
  if p_provider not in ('isolar', 'watchpower') then
    raise exception 'proveedor no válido' using errcode = '22023';
  end if;
  if coalesce((select c.paused from public.provider_query_controls c where c.provider = p_provider), false) then
    return null;
  end if;
  update public.provider_accounts
     set last_attempt_at = now(), sync_lock_until = now() + interval '75 seconds',
         sync_lock_token = v_token, updated_at = now()
   where site_id = p_site_id and provider = p_provider and enabled = true
     and (blocked_until is null or blocked_until <= now())
     and (sync_lock_until is null or sync_lock_until <= now())
     and (status = 'disconnected' or last_attempt_at is null
          or last_attempt_at <= now() - (greatest(60, coalesce(p_minimum_seconds, 60)) * interval '1 second'))
  returning sync_lock_token::text into v_claimed;
  return v_claimed;
end;
$$;
