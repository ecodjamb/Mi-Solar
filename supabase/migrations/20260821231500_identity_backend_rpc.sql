-- Operaciones cerradas de identidad. La llave MISOLAR_DB_KEY se valida dentro
-- de PostgreSQL y ninguna tabla de identidad queda expuesta.
create or replace function public.misolar_identity_backend(p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_user uuid; v_role bigint; v_now timestamptz:=now();
begin
  if not (select private.request_is_misolar()) then raise exception 'backend no autorizado' using errcode='42501'; end if;
  case p_operation
    when 'role_by_key' then
      select to_jsonb(x) into v_result from (select id,key,name from public.roles where key=p_payload->>'key' limit 1) x;
    when 'user_by_username' then
      select jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'email',u.email,'phone',u.phone,'password_hash',u.password_hash,'role_id',u.role_id,'active',u.active,'must_change_password',u.must_change_password,'roles',jsonb_build_object('key',r.key,'name',r.name)) into v_result
      from public.app_users u join public.roles r on r.id=u.role_id where lower(u.username)=lower(p_payload->>'username') limit 1;
    when 'user_by_id' then
      select jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'email',u.email,'phone',u.phone,'role_id',u.role_id,'active',u.active,'must_change_password',u.must_change_password,'roles',jsonb_build_object('key',r.key,'name',r.name)) into v_result
      from public.app_users u join public.roles r on r.id=u.role_id where u.id=(p_payload->>'user_id')::uuid;
    when 'permissions' then
      select jsonb_build_object(
        'role',(select key from public.roles where id=(p_payload->>'role_id')::bigint),
        'permissions',(select coalesce(jsonb_agg(p.key order by p.key),'[]'::jsonb) from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=(p_payload->>'role_id')::bigint),
        'menus',(select coalesce(jsonb_object_agg(menu_key,allowed),'{}'::jsonb) from public.user_menu_permissions where user_id=(p_payload->>'user_id')::uuid),
        'actions',(select coalesce(jsonb_object_agg(action_key,allowed),'{}'::jsonb) from public.user_action_permissions where user_id=(p_payload->>'user_id')::uuid)
      ) into v_result;
    when 'create_user' then
      insert into public.app_users(username,display_name,email,phone,password_hash,role_id,active,must_change_password)
      values (p_payload->>'username',p_payload->>'display_name',nullif(p_payload->>'email',''),nullif(p_payload->>'phone',''),p_payload->>'password_hash',(p_payload->>'role_id')::bigint,coalesce((p_payload->>'active')::boolean,true),coalesce((p_payload->>'must_change_password')::boolean,true))
      returning id into v_user;
      insert into public.expense_accounts(user_id,name,currency) values(v_user,'Rendición de gastos','CLP') on conflict(user_id,currency) do nothing;
      v_result:=jsonb_build_object('id',v_user);
    when 'session_create' then
      insert into public.authorized_devices(id,user_id,label,user_agent_hash,last_ip_hash,last_seen_at)
      values((p_payload->>'device_id')::uuid,(p_payload->>'user_id')::uuid,'Dispositivo autorizado',p_payload->>'user_agent_hash',nullif(p_payload->>'ip_hash',''),v_now);
      insert into public.user_sessions(user_id,refresh_token_hash,csrf_token_hash,device_id,expires_at)
      values((p_payload->>'user_id')::uuid,p_payload->>'refresh_token_hash',p_payload->>'csrf_token_hash',(p_payload->>'device_id')::uuid,(p_payload->>'expires_at')::timestamptz);
      update public.app_users set last_login_at=v_now where id=(p_payload->>'user_id')::uuid;
      v_result:=jsonb_build_object('ok',true);
    when 'session_open' then
      select jsonb_build_object('session',jsonb_build_object('id',s.id,'user_id',s.user_id,'csrf_token_hash',s.csrf_token_hash,'device_id',s.device_id,'expires_at',s.expires_at),'user',jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'email',u.email,'phone',u.phone,'role_id',u.role_id,'active',u.active,'must_change_password',u.must_change_password,'roles',jsonb_build_object('key',r.key,'name',r.name))) into v_result
      from public.user_sessions s join public.app_users u on u.id=s.user_id join public.roles r on r.id=u.role_id
      where s.refresh_token_hash=p_payload->>'refresh_token_hash' and s.revoked_at is null and s.expires_at>v_now limit 1;
    when 'session_touch' then
      update public.user_sessions set last_used_at=v_now where id=(p_payload->>'session_id')::uuid;
      update public.authorized_devices set last_seen_at=v_now where id=nullif(p_payload->>'device_id','')::uuid;
      v_result:=jsonb_build_object('ok',true);
    when 'session_logout' then
      update public.user_sessions set revoked_at=v_now where refresh_token_hash=p_payload->>'refresh_token_hash' and revoked_at is null;
      v_result:=jsonb_build_object('ok',true);
    when 'list_users' then
      select jsonb_build_object(
        'users',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'email',u.email,'phone',u.phone,'active',u.active,'must_change_password',u.must_change_password,'created_at',u.created_at,'last_login_at',u.last_login_at,'role_id',u.role_id,'roles',jsonb_build_object('key',r.key,'name',r.name)) order by u.created_at),'[]'::jsonb) from public.app_users u join public.roles r on r.id=u.role_id),
        'sites',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by id),'[]'::jsonb) from public.solar_sites),
        'site_permissions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.user_site_permissions x),
        'menu_permissions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.user_menu_permissions x),
        'action_permissions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.user_action_permissions x),
        'devices',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select id,user_id,label,last_seen_at,created_at from public.authorized_devices where revoked_at is null) x)
      ) into v_result;
    when 'user_snapshot' then
      select to_jsonb(x) into v_result from (select id,username,display_name,email,phone,active,role_id from public.app_users where id=(p_payload->>'user_id')::uuid) x;
    when 'user_update' then
      update public.app_users set
        display_name=case when p_payload?'display_name' then p_payload->>'display_name' else display_name end,
        email=case when p_payload?'email' then nullif(p_payload->>'email','') else email end,
        phone=case when p_payload?'phone' then nullif(p_payload->>'phone','') else phone end,
        active=case when p_payload?'active' then (p_payload->>'active')::boolean else active end,
        role_id=case when p_payload?'role_id' then (p_payload->>'role_id')::bigint else role_id end,updated_at=v_now
      where id=(p_payload->>'user_id')::uuid;
      v_result:=jsonb_build_object('ok',true);
    when 'access_set' then
      v_user:=(p_payload->>'user_id')::uuid;
      if p_payload?'site_ids' then
        delete from public.user_site_permissions where user_id=v_user;
        insert into public.user_site_permissions(user_id,site_id,can_view,can_control_isolar)
        select v_user,(value::text)::bigint,true,coalesce((p_payload->>'can_control_isolar')::boolean,false) from jsonb_array_elements(p_payload->'site_ids');
      end if;
      if p_payload?'menus' then
        insert into public.user_menu_permissions(user_id,menu_key,allowed) select v_user,key,(value::text)::boolean from jsonb_each(p_payload->'menus') on conflict(user_id,menu_key) do update set allowed=excluded.allowed;
      end if;
      if p_payload?'actions' then
        insert into public.user_action_permissions(user_id,action_key,allowed) select v_user,key,(value::text)::boolean from jsonb_each(p_payload->'actions') on conflict(user_id,action_key) do update set allowed=excluded.allowed;
      end if;
      v_result:=jsonb_build_object('ok',true);
    when 'password_reset' then
      update public.app_users set password_hash=p_payload->>'password_hash',must_change_password=true,password_changed_at=v_now,updated_at=v_now where id=(p_payload->>'user_id')::uuid;
      update public.user_sessions set revoked_at=v_now where user_id=(p_payload->>'user_id')::uuid and revoked_at is null;
      update public.authorized_devices set revoked_at=v_now where user_id=(p_payload->>'user_id')::uuid and revoked_at is null;
      v_result:=jsonb_build_object('ok',true);
    when 'sessions_revoke' then
      update public.user_sessions set revoked_at=v_now where user_id=(p_payload->>'user_id')::uuid and revoked_at is null;
      update public.authorized_devices set revoked_at=v_now where user_id=(p_payload->>'user_id')::uuid and revoked_at is null;
      v_result:=jsonb_build_object('ok',true);
    when 'audit' then
      insert into public.audit_events(actor_user_id,action,entity_type,entity_id,before_values,after_values,metadata)
      values(nullif(p_payload->>'actor_user_id','')::uuid,p_payload->>'action',p_payload->>'entity_type',nullif(p_payload->>'entity_id',''),p_payload->'before_values',p_payload->'after_values',coalesce(p_payload->'metadata','{}'::jsonb));
      v_result:=jsonb_build_object('ok',true);
    else raise exception 'operación no permitida' using errcode='22023';
  end case;
  return coalesce(v_result,'null'::jsonb);
end; $$;
revoke all on function public.misolar_identity_backend(text,jsonb) from public,authenticated;
grant execute on function public.misolar_identity_backend(text,jsonb) to anon;
