-- Vercel Hobby admite cron diario solamente. Supabase despierta el endpoint
-- cada cinco minutos reutilizando el secreto ya cifrado en Vault.
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='misolar-tuya-rules-5m' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;

select cron.schedule(
  'misolar-tuya-rules-5m',
  '*/5 * * * *',
  $job$
  select net.http_get(
    url := 'https://misolar.vercel.app/api/tuya/run-rules',
    headers := jsonb_build_object(
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='misolar_cron_secret' limit 1)
    )
  );
  $job$
);
