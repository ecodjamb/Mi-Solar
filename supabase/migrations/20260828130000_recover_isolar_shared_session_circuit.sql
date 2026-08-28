-- Recuperación no destructiva del circuito i.Solar.
--
-- Las cuentas que comparten credenciales ahora reutilizan una sola sesión en
-- el backend. Se revocan únicamente los tokens externos obsoletos y se libera
-- el circuito preventivo para que la nueva versión cree una sesión limpia.
-- No se elimina telemetría, históricos, cuentas, credenciales ni dispositivos.

update public.provider_sessions as session
set revoked_at = now()
from public.provider_accounts as account
where session.provider_account_id = account.id
  and account.provider = 'isolar'
  and session.revoked_at is null;

update public.provider_accounts
set status = 'disconnected',
    consecutive_failures = 0,
    blocked_until = null,
    last_error_code = null,
    last_error_sanitized = null,
    updated_at = now()
where provider = 'isolar'
  and enabled = true;
