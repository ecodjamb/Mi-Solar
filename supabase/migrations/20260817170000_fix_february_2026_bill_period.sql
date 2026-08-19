-- The original image extraction stored 22–26 February, while the bill itself
-- identifies the reading period as 22 January–20 February 2026. Merge a
-- duplicate corrected row when present and preserve every uploaded page.
do $$
declare
  v_site_id bigint;
  v_source_id bigint;
  v_target_id bigint;
  v_next_page integer;
begin
  select id into v_site_id from public.solar_sites where device_sn = '96342509120972';
  select id into v_source_id from public.utility_bills where site_id = v_site_id and invoice_number = '363285338' and period_start = date '2026-02-22' and period_end = date '2026-02-26';
  select id into v_target_id from public.utility_bills where site_id = v_site_id and period_start = date '2026-01-22' and period_end = date '2026-02-20';

  if v_source_id is not null and v_target_id is not null then
    select coalesce(max(page_number), 0) into v_next_page from public.utility_bill_documents where bill_id = v_target_id;
    update public.utility_bill_documents d
       set bill_id = v_target_id,
           page_number = v_next_page + moved.position
      from (select id, row_number() over (order by page_number, id)::integer as position from public.utility_bill_documents where bill_id = v_source_id) moved
     where d.id = moved.id;
    update public.utility_bills target
       set invoice_number = coalesce(target.invoice_number, source.invoice_number),
           ai_extraction = jsonb_set(jsonb_set(coalesce(target.ai_extraction, source.ai_extraction, '{}'::jsonb), '{periodStart}', '"2026-01-22"'::jsonb, true), '{periodEnd}', '"2026-02-20"'::jsonb, true)
             || jsonb_build_object('periodCorrectionReason', 'Respaldo de boleta: período de lectura 22/01/2026–20/02/2026'),
           updated_at = now()
      from public.utility_bills source
     where target.id = v_target_id and source.id = v_source_id;
    delete from public.utility_bills where id = v_source_id;
  elsif v_source_id is not null then
    update public.utility_bills
       set period_start = date '2026-01-22', period_end = date '2026-02-20', updated_at = now()
     where id = v_source_id;
  end if;
end $$;
