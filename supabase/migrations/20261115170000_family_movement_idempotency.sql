-- Impide que un doble toque, una retransmisión o el adjunto de una fotografía
-- creen dos ingresos familiares. La llave la genera el formulario una sola vez.
alter table public.expense_movements
  add column if not exists idempotency_key text;

create unique index if not exists expense_movements_idempotency_uidx
  on public.expense_movements(idempotency_key)
  where idempotency_key is not null;

create or replace function private.misolar_family_movement_create_idempotent_backend(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_id bigint;
  v_record jsonb;
  v_attachment uuid;
  v_extraction uuid;
  v_inserted boolean := false;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode='42501';
  end if;
  if nullif(btrim(p_payload->>'idempotency_key'),'') is null then
    raise exception 'llave de idempotencia requerida' using errcode='22023';
  end if;

  insert into public.expense_movements(
    account_id,movement_date,detail,income_minor,expense_minor,currency,status,
    created_by,movement_type,depositor_user_id,recipient_user_id,merchant_name,idempotency_key
  ) values (
    (p_payload->>'account_id')::bigint,(p_payload->>'movement_date')::date,p_payload->>'detail',
    (p_payload->>'income_minor')::bigint,(p_payload->>'expense_minor')::bigint,p_payload->>'currency','pending',
    (p_payload->>'created_by')::uuid,p_payload->>'movement_type',(p_payload->>'depositor_user_id')::uuid,
    (p_payload->>'recipient_user_id')::uuid,nullif(p_payload->>'merchant_name',''),p_payload->>'idempotency_key'
  ) on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    select to_jsonb(m) into v_record
      from public.expense_movements m
      where m.idempotency_key=p_payload->>'idempotency_key';
    return jsonb_build_object('record',v_record,'duplicate',true);
  end if;
  v_inserted := true;
  select to_jsonb(m) into v_record from public.expense_movements m where m.id=v_id;

  if v_inserted and p_payload?'attachment' then
    insert into public.financial_attachments(
      owner_user_id,entity_type,entity_id,storage_path,original_name,mime_type,size_bytes,sha256,metadata
    ) values (
      (p_payload->>'created_by')::uuid,'expense_movement',v_id::text,p_payload#>>'{attachment,storage_path}',
      p_payload#>>'{attachment,original_name}',p_payload#>>'{attachment,mime_type}',
      (p_payload#>>'{attachment,size_bytes}')::bigint,p_payload#>>'{attachment,sha256}',
      coalesce(p_payload#>'{attachment,metadata}','{}'::jsonb)
    ) returning id into v_attachment;
    if p_payload?'ai_proposal' then
      insert into public.ai_document_extractions(attachment_id,proposed_values,model,status)
      values(v_attachment,p_payload->'ai_proposal',nullif(p_payload->>'ai_model',''),'validated')
      returning id into v_extraction;
      insert into public.financial_validations(extraction_id,validator_user_id,corrected_values)
      values(v_extraction,(p_payload->>'created_by')::uuid,coalesce(p_payload->'corrected_values','{}'::jsonb));
    end if;
  end if;

  return jsonb_build_object('record',v_record,'attachment_id',v_attachment,'duplicate',false);
end; $$;

revoke all on function private.misolar_family_movement_create_idempotent_backend(jsonb) from public,authenticated;
grant execute on function private.misolar_family_movement_create_idempotent_backend(jsonb) to anon;

create or replace function public.misolar_family_movement_create_idempotent_backend(p_payload jsonb)
returns jsonb language sql security invoker set search_path=''
as 'select private.misolar_family_movement_create_idempotent_backend(p_payload)';

revoke all on function public.misolar_family_movement_create_idempotent_backend(jsonb) from public,authenticated;
grant execute on function public.misolar_family_movement_create_idempotent_backend(jsonb) to anon;
