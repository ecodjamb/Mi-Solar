-- Respaldo diario completo de i.Solar. Se ejecuta después de la medianoche
-- tanto con horario de verano como de invierno en Chile y descarga el día
-- local anterior ya cerrado. El backend convierte el rango a Asia/Shanghai,
-- agrupa las instalaciones que comparten sesión y guarda por upsert, por lo
-- que la operación es idempotente y no duplica muestras.

do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'misolar-isolar-daily-history'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'misolar-isolar-daily-history',
  '20 4 * * *',
  $job$
  select net.http_post(
    url := 'https://misolar.vercel.app/api/providers/isolar/history-day',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'misolar_cron_secret'
        limit 1
      ), '')
    ),
    body := jsonb_build_object('scheduled_at', now(), 'target', 'previous_santiago_day'),
    timeout_milliseconds := 55000
  );
  $job$
);
