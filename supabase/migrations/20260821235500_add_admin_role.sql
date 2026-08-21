insert into public.roles(key,name) values ('admin','Administrador') on conflict(key) do update set name=excluded.name;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in('family.view','family.create','family.approve','isolar.write') where r.key='admin'
on conflict do nothing;
