-- Reclamo atómico para evitar que dos teléfonos o el cron consulten el mismo
-- proveedor simultáneamente. No modifica ni elimina telemetría histórica.

create or replace function private.misolar_provider_sync_claim_backend(
  p_site_id bigint,
  p_provider text,
  p_minimum_seconds integer default 90,
  p_force boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean := false;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode = '42501';
  end if;

  if p_provider not in ('isolar', 'watchpower') then
    raise exception 'proveedor no válido' using errcode = '22023';
  end if;

  update public.provider_accounts
     set last_attempt_at = now(), updated_at = now()
   where site_id = p_site_id
     and provider = p_provider
     and enabled = true
     and (
       p_force
       or last_attempt_at is null
       or last_attempt_at <= now() - (greatest(30, coalesce(p_minimum_seconds, 90)) * interval '1 second')
     )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

grant execute on function private.misolar_provider_sync_claim_backend(bigint,text,integer,boolean) to anon;

create or replace function public.misolar_provider_sync_claim_backend(
  p_site_id bigint,
  p_provider text,
  p_minimum_seconds integer default 90,
  p_force boolean default false
)
returns boolean
language sql
security invoker
set search_path = ''
as 'select private.misolar_provider_sync_claim_backend(p_site_id,p_provider,p_minimum_seconds,p_force)';

revoke all on function public.misolar_provider_sync_claim_backend(bigint,text,integer,boolean) from public, authenticated;
grant execute on function public.misolar_provider_sync_claim_backend(bigint,text,integer,boolean) to anon;
