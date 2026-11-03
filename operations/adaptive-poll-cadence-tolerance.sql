
create or replace function private.misolar_poll_policy_backend(p_monitor boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_visible boolean; v_seconds integer; v_run boolean:=true;
begin
 if not private.request_is_misolar() then raise exception 'backend no autorizado' using errcode='42501'; end if;
 v_visible:=private.misolar_app_is_visible();
 v_seconds:=case when v_visible then 300 else 900 end;
 if p_monitor then
   insert into private.misolar_visible_activity(id,last_seen_at) values(true,'1970-01-01') on conflict do nothing;
   update private.misolar_visible_activity set last_monitor_at=now()
    where id and (last_monitor_at is null or last_monitor_at<=now()-make_interval(secs=>greatest(30,v_seconds-30)));
   v_run:=found;
 end if;
 return jsonb_build_object('visible',v_visible,'minimumSeconds',v_seconds,'runMonitor',v_run);
end $$;

