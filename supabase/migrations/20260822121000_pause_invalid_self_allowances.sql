-- Las cuentas corrientes familiares siempre requieren dos personas distintas.
-- Se conservan los registros históricos inválidos, pero no deben generar cargos.
update public.allowances
set status='paused',updated_at=now()
where status='active'
  and beneficiary_user_id=responsible_user_id;
