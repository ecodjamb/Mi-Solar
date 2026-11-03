-- Applied 2026-11-03 UTC. No telemetry or credentials are removed.
select cron.alter_job(job_id:=jobid,active:=false) from cron.job
where jobname in ('misolar-tuya-rules-5m','misolar-pool-solar-automation-every-minute');
select cron.alter_job(job_id:=jobid,schedule:='1-59/5 * * * *') from cron.job
where jobname='misolar-provider-sync-every-minute';
create index if not exists provider_sessions_active_account_idx
on public.provider_sessions(provider_account_id, expires_at desc) where revoked_at is null;
-- Rollback: drop the new index; reactivate the two jobs and restore provider '* * * * *'.
