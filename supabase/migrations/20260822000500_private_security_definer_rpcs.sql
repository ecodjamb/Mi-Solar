-- Los cuerpos SECURITY DEFINER viven fuera del esquema expuesto por PostgREST.
-- Public solo conserva wrappers SECURITY INVOKER sin acceso directo a tablas.
alter function public.misolar_provider_backend(text,jsonb) set schema private;
alter function public.misolar_identity_backend(text,jsonb) set schema private;
alter function public.misolar_family_backend(text,jsonb) set schema private;

grant usage on schema private to anon;
grant execute on function private.misolar_provider_backend(text,jsonb), private.misolar_identity_backend(text,jsonb), private.misolar_family_backend(text,jsonb) to anon;

create function public.misolar_provider_backend(p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as 'select private.misolar_provider_backend(p_operation,p_payload)';
create function public.misolar_identity_backend(p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as 'select private.misolar_identity_backend(p_operation,p_payload)';
create function public.misolar_family_backend(p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as 'select private.misolar_family_backend(p_operation,p_payload)';

revoke all on function public.misolar_provider_backend(text,jsonb),public.misolar_identity_backend(text,jsonb),public.misolar_family_backend(text,jsonb) from public,authenticated;
grant execute on function public.misolar_provider_backend(text,jsonb),public.misolar_identity_backend(text,jsonb),public.misolar_family_backend(text,jsonb) to anon;
