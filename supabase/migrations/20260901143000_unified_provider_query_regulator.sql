-- Regulador distribuido de consultas a proveedores.
-- Una única concesión cubre todos los procesos de Vercel, teléfonos y pestañas.
-- La cadencia mínima es de 60 s y la concesión vence sola si una función cae.

alter table public.provider_accounts
  add column if not exists sync_lock_until timestamptz,
  add column if not exists sync_lock_token uuid;

comment on column public.provider_accounts.sync_lock_until is
  'Vencimiento de la concesión distribuida que impide consultas simultáneas al proveedor.';
comment on column public.provider_accounts.sync_lock_token is
  'Token propietario de la concesión; evita que una ejecución antigua libere una concesión nueva.';

create or replace function private.misolar_provider_sync_lease_backend(
  p_site_id bigint,
  p_provider text,
  p_minimum_seconds integer default 60
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid := gen_random_uuid();
  v_claimed text;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode = '42501';
  end if;

  if p_provider not in ('isolar', 'watchpower') then
    raise exception 'proveedor no válido' using errcode = '22023';
  end if;

  update public.provider_accounts
     set last_attempt_at = now(),
         sync_lock_until = now() + interval '75 seconds',
         sync_lock_token = v_token,
         updated_at = now()
   where site_id = p_site_id
     and provider = p_provider
     and enabled = true
     and (blocked_until is null or blocked_until <= now())
     and (sync_lock_until is null or sync_lock_until <= now())
     and (
       status = 'disconnected'
       or
       last_attempt_at is null
       or last_attempt_at <= now() - (greatest(60, coalesce(p_minimum_seconds, 60)) * interval '1 second')
     )
  returning sync_lock_token::text into v_claimed;

  return v_claimed;
end;
$$;

create or replace function private.misolar_provider_sync_release_backend(
  p_site_id bigint,
  p_provider text,
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released boolean := false;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode = '42501';
  end if;

  update public.provider_accounts
     set sync_lock_until = null,
         sync_lock_token = null,
         updated_at = now()
   where site_id = p_site_id
     and provider = p_provider
     and sync_lock_token::text = p_token
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

revoke all on function private.misolar_provider_sync_lease_backend(bigint,text,integer) from public, authenticated;
revoke all on function private.misolar_provider_sync_release_backend(bigint,text,text) from public, authenticated;
grant execute on function private.misolar_provider_sync_lease_backend(bigint,text,integer) to anon;
grant execute on function private.misolar_provider_sync_release_backend(bigint,text,text) to anon;

create or replace function public.misolar_provider_sync_lease_backend(
  p_site_id bigint,
  p_provider text,
  p_minimum_seconds integer default 60
)
returns text
language sql
security invoker
set search_path = ''
as 'select private.misolar_provider_sync_lease_backend(p_site_id,p_provider,p_minimum_seconds)';

create or replace function public.misolar_provider_sync_release_backend(
  p_site_id bigint,
  p_provider text,
  p_token text
)
returns boolean
language sql
security invoker
set search_path = ''
as 'select private.misolar_provider_sync_release_backend(p_site_id,p_provider,p_token)';

revoke all on function public.misolar_provider_sync_lease_backend(bigint,text,integer) from public, authenticated;
revoke all on function public.misolar_provider_sync_release_backend(bigint,text,text) from public, authenticated;
grant execute on function public.misolar_provider_sync_lease_backend(bigint,text,integer) to anon;
grant execute on function public.misolar_provider_sync_release_backend(bigint,text,text) to anon;
