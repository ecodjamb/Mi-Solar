-- i.Solar publica actualmente cerca de xx:02:45, xx:07:45, etc. La precisión
-- de pg_cron es de un minuto, por lo que xx:03 es el primer instante seguro:
-- aproximadamente 15 segundos después y nunca antes del dato nuevo.
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname='misolar-provider-sync-every-minute';

  if v_job_id is null then
    raise exception 'No existe el cron unificado de proveedores de Mi Solar';
  end if;

  perform cron.alter_job(
    job_id:=v_job_id,
    schedule:='3-59/5 * * * *'
  );
end $$;
