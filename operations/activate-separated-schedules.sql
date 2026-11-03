
create function private.misolar_reconcile_automation_cron() returns trigger language plpgsql security definer set search_path='' as $$
declare v_enabled boolean;v_job bigint;
begin
 select exists(select 1 from public.automation_rules where enabled=true) into v_enabled;
 select jobid into v_job from cron.job where jobname='misolar-automation-every-5-minutes';
 if v_job is not null then perform cron.alter_job(job_id:=v_job,active:=v_enabled);end if;
 return null;
end $$;
revoke all on function private.misolar_reconcile_automation_cron() from public,anon,authenticated,service_role;
create trigger misolar_automation_cron_state after insert or delete or update of enabled on public.automation_rules for each statement execute function private.misolar_reconcile_automation_cron();
select cron.alter_job(job_id:=jobid,active:=exists(select 1 from public.automation_rules where enabled=true))
from cron.job where jobname='misolar-automation-every-5-minutes';
select cron.schedule('misolar-forecast-four-times-chile','0,35 * * * *',$task$select private.misolar_dispatch_scheduled('forecast');$task$);
select cron.schedule('misolar-reading-reminders-morning','0 * * * *',$task$select private.misolar_dispatch_scheduled('reading-reminders');$task$);

