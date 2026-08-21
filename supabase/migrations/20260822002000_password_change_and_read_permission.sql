-- Cambio obligatorio de la clave inicial y permisos explícitos de lectura.
insert into public.permissions(key,description) values
  ('solar.view','Ver datos solares e históricos'),
  ('audit.view','Revisar auditoría')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='superadmin'
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='solar.view'
where r.key in('admin','member')
on conflict do nothing;

create or replace function private.misolar_password_change_backend(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_now timestamptz:=now();
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode='42501';
  end if;
  v_user:=(p_payload->>'user_id')::uuid;
  update public.app_users
  set password_hash=p_payload->>'password_hash',must_change_password=false,password_changed_at=v_now,updated_at=v_now
  where id=v_user;
  if not found then raise exception 'usuario no encontrado' using errcode='P0002'; end if;
  update public.user_sessions set revoked_at=v_now where user_id=v_user and revoked_at is null;
  update public.authorized_devices set revoked_at=v_now where user_id=v_user and revoked_at is null;
  return jsonb_build_object('ok',true);
end; $$;

revoke all on function private.misolar_password_change_backend(jsonb) from public,authenticated;
grant execute on function private.misolar_password_change_backend(jsonb) to anon;

create or replace function public.misolar_password_change_backend(p_payload jsonb)
returns jsonb language sql security invoker set search_path=''
as 'select private.misolar_password_change_backend(p_payload)';

revoke all on function public.misolar_password_change_backend(jsonb) from public,authenticated;
grant execute on function public.misolar_password_change_backend(jsonb) to anon;
