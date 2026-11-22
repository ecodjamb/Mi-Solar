-- Mantiene una sola concesión distribuida por proveedor, pero permite que la
-- auditoría histórica iniciada por el usuario aproveche el espacio seguro de
-- 30 segundos entre sincronizaciones de un minuto. Los cron continúan pasando
-- 60 segundos y, por tanto, conservan su cadencia actual.

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
       or last_attempt_at <= now() - (greatest(30, coalesce(p_minimum_seconds, 60)) * interval '1 second')
     )
  returning sync_lock_token::text into v_claimed;

  return v_claimed;
end;
$$;
