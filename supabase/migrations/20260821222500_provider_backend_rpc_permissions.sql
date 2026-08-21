-- El backend de Mi Solar usa el rol anon más una segunda clave privada.
-- Los usuarios autenticados no acceden directamente a esta frontera.
revoke all on function public.misolar_provider_backend(text,jsonb) from public, authenticated;
grant execute on function public.misolar_provider_backend(text,jsonb) to anon;
