-- Recuperación no destructiva del circuito i.Solar.
--
-- Las cuentas que comparten credenciales ahora reutilizan una sola sesión en
-- el backend. Se libera únicamente el circuito preventivo que quedó atrapado
-- recontando su propio error CIRCUIT_OPEN.
-- No se elimina telemetría, históricos, cuentas, credenciales ni dispositivos.

update public.provider_accounts
set status = 'disconnected',
    consecutive_failures = 0,
    blocked_until = null,
    last_error_code = null,
    last_error_sanitized = null,
    updated_at = now()
where provider = 'isolar'
  and enabled = true
  and status = 'temporarily_blocked'
  and last_error_code = 'CIRCUIT_OPEN';
