-- Coordinador único de telemetría. Despierta una vez por minuto; el regulador
-- distribuido decide si corresponde consultar o reutilizar el ciclo vigente.

do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'misolar-provider-sync-every-minute'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'misolar-provider-sync-every-minute',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://misolar.vercel.app/api/providers/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'misolar_cron_secret'
        limit 1
      ), '')
    ),
    body := jsonb_build_object('scheduled_at', now()),
    timeout_milliseconds := 55000
  );
  $job$
);
