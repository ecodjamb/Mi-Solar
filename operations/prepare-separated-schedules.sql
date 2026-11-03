
create table private.misolar_scheduled_commands(task text primary key check(task in ('forecast','reading-reminders')),command text not null);
alter table private.misolar_scheduled_commands enable row level security;
revoke all on private.misolar_scheduled_commands from public,anon,authenticated,service_role;
insert into private.misolar_scheduled_commands(task,command)
select 'forecast',replace(command,'/api/automation/run','/api/forecast/run') from cron.job where jobname='misolar-automation-every-5-minutes' and position('/api/automation/run' in command)>0;
insert into private.misolar_scheduled_commands(task,command)
select 'reading-reminders',replace(command,'/api/notifications/monitor','/api/notifications/reminders') from cron.job where jobname='misolar-notification-monitor-every-5-minutes' and position('/api/notifications/monitor' in command)>0;
do $$begin if (select count(*) from private.misolar_scheduled_commands)<>2 then raise exception 'No se encontraron las dos plantillas de tareas'; end if;end$$;
create table private.misolar_scheduled_dispatches(task text not null,local_date date not null,local_time text not null,request_id bigint,primary key(task,local_date,local_time));
alter table private.misolar_scheduled_dispatches enable row level security;
revoke all on private.misolar_scheduled_dispatches from public,anon,authenticated,service_role;
create function private.misolar_schedule_due(p_task text,p_now timestamptz default now()) returns boolean language sql stable set search_path='' as $$
select case p_task
when 'forecast' then to_char(p_now at time zone 'America/Santiago','HH24:MI') in ('08:00','12:00','17:00','21:35')
when 'reading-reminders' then to_char(p_now at time zone 'America/Santiago','HH24:MI')='09:00'
else false end
$$;
revoke all on function private.misolar_schedule_due(text,timestamptz) from public,anon,authenticated,service_role;
create function private.misolar_dispatch_scheduled(p_task text) returns bigint language plpgsql set search_path='' as $$
declare v_command text;v_request bigint;v_date date;v_time text;
begin
 if not private.misolar_schedule_due(p_task) then return null;end if;
 select command into strict v_command from private.misolar_scheduled_commands where task=p_task;
 v_date:=(now() at time zone 'America/Santiago')::date;
 v_time:=to_char(now() at time zone 'America/Santiago','HH24:MI');
 insert into private.misolar_scheduled_dispatches(task,local_date,local_time) values(p_task,v_date,v_time) on conflict do nothing;
 if not found then return null; end if;
 execute v_command into v_request;
 update private.misolar_scheduled_dispatches set request_id=v_request where task=p_task and local_date=v_date and local_time=v_time;
 return v_request;
end $$;
revoke all on function private.misolar_dispatch_scheduled(text) from public,anon,authenticated,service_role;

