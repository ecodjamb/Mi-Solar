grant delete on public.utility_bills to anon;
grant delete on public.utility_bill_documents to anon;

drop policy if exists misolar_backend_bill_pages_delete on storage.objects;
create policy misolar_backend_bill_pages_delete on storage.objects
  for delete to anon
  using (bucket_id = 'utility-bill-pages' and (select private.request_is_misolar()));

comment on policy misolar_backend_bill_pages_delete on storage.objects is
  'Permite al backend autenticado de Mi Solar eliminar fotografías cuando se borra o reemplaza una cuenta.';
