-- Finanzas familiares: comprobantes privados, participantes explícitos,
-- aprobación administrativa y pagos idempotentes. La migración conserva
-- todos los registros existentes y solamente agrega capacidad.
alter table public.expense_movements
  add column if not exists movement_type text not null default 'expense_report',
  add column if not exists depositor_user_id uuid references public.app_users(id) on delete restrict,
  add column if not exists recipient_user_id uuid references public.app_users(id) on delete restrict,
  add column if not exists merchant_name text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table public.family_loans
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approved_by uuid references public.app_users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists review_note text;

alter table public.loan_payments
  add column if not exists reviewed_by uuid references public.app_users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table public.expense_movements drop constraint if exists expense_movements_movement_type_check;
alter table public.expense_movements add constraint expense_movements_movement_type_check check (movement_type in ('expense_report','deposit'));
alter table public.family_loans drop constraint if exists family_loans_approval_status_check;
alter table public.family_loans add constraint family_loans_approval_status_check check (approval_status in ('pending','approved','rejected'));
alter table public.loan_payments drop constraint if exists loan_payments_status_check;
alter table public.loan_payments add constraint loan_payments_status_check check (status in ('pending','confirmed','rejected','void'));

create index if not exists expense_movements_review_idx on public.expense_movements(status,created_at desc);
create index if not exists financial_attachments_entity_idx on public.financial_attachments(entity_type,entity_id,created_at desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('family-finance-documents','family-finance-documents',false,1600000,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists misolar_backend_family_documents_select on storage.objects;
create policy misolar_backend_family_documents_select on storage.objects for select to anon
using(bucket_id='family-finance-documents' and (select private.request_is_misolar()));
drop policy if exists misolar_backend_family_documents_insert on storage.objects;
create policy misolar_backend_family_documents_insert on storage.objects for insert to anon
with check(bucket_id='family-finance-documents' and (select private.request_is_misolar()));
drop policy if exists misolar_backend_family_documents_update on storage.objects;
create policy misolar_backend_family_documents_update on storage.objects for update to anon
using(bucket_id='family-finance-documents' and (select private.request_is_misolar()))
with check(bucket_id='family-finance-documents' and (select private.request_is_misolar()));
drop policy if exists misolar_backend_family_documents_delete on storage.objects;
create policy misolar_backend_family_documents_delete on storage.objects for delete to anon
using(bucket_id='family-finance-documents' and (select private.request_is_misolar()));

-- El bootstrap antiguo queda conservado y desactivado, pero ya no conserva
-- autoridad administrativa. ecodjamb es el único superadministrador activo.
update public.app_users
set role_id=(select id from public.roles where key='member'),updated_at=now()
where username='[SENSITIVE]' and active=false;

create or replace function private.misolar_family_backend(p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_result jsonb; v_id bigint; v_loan public.family_loans%rowtype; v_amount bigint; v_paid bigint; v_status text;
  v_attachment uuid; v_extraction uuid; v_entity text; v_entity_id text;
begin
  if not (select private.request_is_misolar()) then raise exception 'backend no autorizado' using errcode='42501'; end if;
  case p_operation
    when 'dashboard' then
      select jsonb_build_object(
        'users',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'username',username,'active',active) order by display_name,username),'[]'::jsonb) from public.app_users where active=true),
        'allowances',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) from public.allowances a where (p_payload->>'admin')::boolean or a.beneficiary_user_id=(p_payload->>'user_id')::uuid or a.responsible_user_id=(p_payload->>'user_id')::uuid),
        'obligations',(select coalesce(jsonb_agg(to_jsonb(o) order by o.due_on desc),'[]'::jsonb) from public.allowance_obligations o join public.allowances a on a.id=o.allowance_id where (p_payload->>'admin')::boolean or a.beneficiary_user_id=(p_payload->>'user_id')::uuid or a.responsible_user_id=(p_payload->>'user_id')::uuid),
        'allowance_payments',(select coalesce(jsonb_agg(to_jsonb(ap) order by ap.paid_on desc),'[]'::jsonb) from public.allowance_payments ap join public.allowance_obligations o on o.id=ap.obligation_id join public.allowances a on a.id=o.allowance_id where ap.status<>'void' and ((p_payload->>'admin')::boolean or a.beneficiary_user_id=(p_payload->>'user_id')::uuid or a.responsible_user_id=(p_payload->>'user_id')::uuid)),
        'loans',(select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc),'[]'::jsonb) from public.family_loans l where (p_payload->>'admin')::boolean or l.lender_user_id=(p_payload->>'user_id')::uuid or l.borrower_user_id=(p_payload->>'user_id')::uuid),
        'payments',(select coalesce(jsonb_agg(to_jsonb(lp) order by lp.payment_date desc),'[]'::jsonb) from public.loan_payments lp join public.family_loans l on l.id=lp.loan_id where lp.status<>'void' and ((p_payload->>'admin')::boolean or l.lender_user_id=(p_payload->>'user_id')::uuid or l.borrower_user_id=(p_payload->>'user_id')::uuid)),
        'accounts',(select coalesce(jsonb_agg(to_jsonb(ea)),'[]'::jsonb) from public.expense_accounts ea where ea.active=true and ((p_payload->>'admin')::boolean or ea.user_id=(p_payload->>'user_id')::uuid)),
        'movements',(select coalesce(jsonb_agg(to_jsonb(em) order by em.movement_date desc,em.movement_number desc),'[]'::jsonb) from public.expense_movements em join public.expense_accounts ea on ea.id=em.account_id where (p_payload->>'admin')::boolean or ea.user_id=(p_payload->>'user_id')::uuid or em.depositor_user_id=(p_payload->>'user_id')::uuid or em.recipient_user_id=(p_payload->>'user_id')::uuid),
        'attachments',(select coalesce(jsonb_agg(jsonb_build_object('id',fa.id,'entity_type',fa.entity_type,'entity_id',fa.entity_id,'original_name',fa.original_name,'mime_type',fa.mime_type,'created_at',fa.created_at)),'[]'::jsonb) from public.financial_attachments fa where (p_payload->>'admin')::boolean or fa.owner_user_id=(p_payload->>'user_id')::uuid
          or (fa.entity_type='family_loan' and exists(select 1 from public.family_loans l where l.id=fa.entity_id::bigint and (l.lender_user_id=(p_payload->>'user_id')::uuid or l.borrower_user_id=(p_payload->>'user_id')::uuid)))
          or (fa.entity_type='loan_payment' and exists(select 1 from public.loan_payments lp join public.family_loans l on l.id=lp.loan_id where lp.id=fa.entity_id::bigint and (l.lender_user_id=(p_payload->>'user_id')::uuid or l.borrower_user_id=(p_payload->>'user_id')::uuid)))
          or (fa.entity_type='expense_movement' and exists(select 1 from public.expense_movements em join public.expense_accounts ea on ea.id=em.account_id where em.id=fa.entity_id::bigint and (ea.user_id=(p_payload->>'user_id')::uuid or em.depositor_user_id=(p_payload->>'user_id')::uuid or em.recipient_user_id=(p_payload->>'user_id')::uuid)))),
        'notifications',(select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc),'[]'::jsonb) from (select * from public.notifications where user_id=(p_payload->>'user_id')::uuid order by created_at desc limit 100) n)
      ) into v_result;
    when 'allowance_create' then
      insert into public.allowances(beneficiary_user_id,responsible_user_id,amount_minor,currency,frequency,pay_day,custom_interval_days,starts_on,ends_on,status,notes,created_by)
      values((p_payload->>'beneficiary_user_id')::uuid,(p_payload->>'responsible_user_id')::uuid,(p_payload->>'amount_minor')::bigint,coalesce(p_payload->>'currency','CLP'),p_payload->>'frequency',nullif(p_payload->>'pay_day','')::smallint,nullif(p_payload->>'custom_interval_days','')::smallint,(p_payload->>'starts_on')::date,nullif(p_payload->>'ends_on','')::date,coalesce(p_payload->>'status','active'),nullif(p_payload->>'notes',''),(p_payload->>'created_by')::uuid)
      returning id into v_id; select to_jsonb(a) into v_result from public.allowances a where id=v_id;
    when 'allowances_active' then
      select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) into v_result from public.allowances a where status='active' and starts_on<=(p_payload->>'today')::date and (ends_on is null or ends_on>=(p_payload->>'today')::date);
    when 'obligation_create' then
      insert into public.allowance_obligations(allowance_id,due_on,amount_minor,idempotency_key)
      values((p_payload->>'allowance_id')::bigint,(p_payload->>'due_on')::date,(p_payload->>'amount_minor')::bigint,p_payload->>'idempotency_key')
      on conflict(idempotency_key) do nothing returning id into v_id;
      if v_id is null then v_result:=jsonb_build_object('inserted',false); else select jsonb_build_object('inserted',true,'row',to_jsonb(o)) into v_result from public.allowance_obligations o where id=v_id; end if;
    when 'account_get' then select to_jsonb(a) into v_result from public.expense_accounts a where id=(p_payload->>'account_id')::bigint;
    when 'movement_create' then
      insert into public.expense_movements(account_id,movement_date,detail,income_minor,expense_minor,currency,status,created_by,movement_type,depositor_user_id,recipient_user_id,merchant_name)
      values((p_payload->>'account_id')::bigint,(p_payload->>'movement_date')::date,p_payload->>'detail',(p_payload->>'income_minor')::bigint,(p_payload->>'expense_minor')::bigint,p_payload->>'currency','pending',(p_payload->>'created_by')::uuid,p_payload->>'movement_type',(p_payload->>'depositor_user_id')::uuid,(p_payload->>'recipient_user_id')::uuid,nullif(p_payload->>'merchant_name',''))
      returning id into v_id; v_entity:='expense_movement';v_entity_id:=v_id::text;
      select to_jsonb(m) into v_result from public.expense_movements m where id=v_id;
    when 'movement_review' then
      update public.expense_movements set status=p_payload->>'decision',approved_by=(p_payload->>'reviewed_by')::uuid,reviewed_at=now(),review_note=nullif(p_payload->>'note',''),updated_at=now() where id=(p_payload->>'movement_id')::bigint and status='pending' returning to_jsonb(expense_movements.*) into v_result;
    when 'loan_create' then
      insert into public.family_loans(lender_user_id,borrower_user_id,loan_date,original_amount_minor,currency,detail,due_date,created_by,approval_status)
      values((p_payload->>'lender_user_id')::uuid,(p_payload->>'borrower_user_id')::uuid,(p_payload->>'loan_date')::date,(p_payload->>'original_amount_minor')::bigint,coalesce(p_payload->>'currency','CLP'),p_payload->>'detail',nullif(p_payload->>'due_date','')::date,(p_payload->>'created_by')::uuid,'pending')
      returning id into v_id; v_entity:='family_loan';v_entity_id:=v_id::text;
      select to_jsonb(l) into v_result from public.family_loans l where id=v_id;
    when 'loan_get' then select to_jsonb(l) into v_result from public.family_loans l where id=(p_payload->>'loan_id')::bigint;
    when 'loan_review' then
      update public.family_loans set approval_status=p_payload->>'decision',approved_by=(p_payload->>'reviewed_by')::uuid,approved_at=now(),review_note=nullif(p_payload->>'note',''),updated_at=now() where id=(p_payload->>'loan_id')::bigint and approval_status='pending' returning to_jsonb(family_loans.*) into v_result;
    when 'loan_payment' then
      select * into v_loan from public.family_loans where id=(p_payload->>'loan_id')::bigint for update;
      if not found or v_loan.approval_status<>'approved' then raise exception 'préstamo no aprobado' using errcode='22023'; end if;
      v_amount:=(p_payload->>'amount_minor')::bigint;
      if v_amount<=0 then raise exception 'monto inválido' using errcode='22003'; end if;
      if v_loan.paid_amount_minor+v_amount>v_loan.original_amount_minor and not coalesce((p_payload->>'allow_overpayment')::boolean,false) then raise exception 'pago superior al saldo' using errcode='22003'; end if;
      insert into public.loan_payments(loan_id,amount_minor,payment_date,detail,created_by,idempotency_key,status)
      values(v_loan.id,v_amount,(p_payload->>'payment_date')::date,nullif(p_payload->>'detail',''),(p_payload->>'created_by')::uuid,p_payload->>'idempotency_key','pending')
      on conflict(idempotency_key) do nothing returning id into v_id;
      if v_id is null then select to_jsonb(lp) into v_result from public.loan_payments lp where idempotency_key=p_payload->>'idempotency_key'; return v_result; end if;
      v_entity:='loan_payment';v_entity_id:=v_id::text;
      select to_jsonb(lp) into v_result from public.loan_payments lp where id=v_id;
    when 'loan_payment_review' then
      update public.loan_payments set status=case when p_payload->>'decision'='approved' then 'confirmed' else 'rejected' end,reviewed_by=(p_payload->>'reviewed_by')::uuid,reviewed_at=now(),review_note=nullif(p_payload->>'note','') where id=(p_payload->>'payment_id')::bigint and status='pending' returning loan_id into v_id;
      select * into v_loan from public.family_loans where id=v_id for update;
      select coalesce(sum(amount_minor),0) into v_paid from public.loan_payments where loan_id=v_id and status='confirmed';
      v_status:=case when v_paid>=v_loan.original_amount_minor then 'paid' when v_paid>0 then 'partially_paid' else 'pending' end;
      update public.family_loans set paid_amount_minor=v_paid,status=v_status,updated_at=now() where id=v_id returning to_jsonb(family_loans.*) into v_result;
    when 'allowance_payment' then
      insert into public.allowance_payments(obligation_id,amount_minor,paid_on,detail,status,idempotency_key,created_by)
      values((p_payload->>'obligation_id')::bigint,(p_payload->>'amount_minor')::bigint,(p_payload->>'paid_on')::date,nullif(p_payload->>'detail',''),'confirmed',p_payload->>'idempotency_key',(p_payload->>'created_by')::uuid)
      on conflict(idempotency_key) do nothing returning id into v_id;
      if v_id is not null then
        update public.allowance_obligations o set paid_amount_minor=x.paid,status=case when x.paid>=o.amount_minor then 'paid' when x.paid>0 then 'partial' else 'pending' end
        from (select obligation_id,coalesce(sum(amount_minor),0) paid from public.allowance_payments where obligation_id=(p_payload->>'obligation_id')::bigint and status='confirmed' group by obligation_id) x where o.id=x.obligation_id;
        v_entity:='allowance_payment';v_entity_id:=v_id::text;
      end if;
      select to_jsonb(ap) into v_result from public.allowance_payments ap where ap.id=v_id;
    when 'attachment_get' then
      select to_jsonb(fa) into v_result from public.financial_attachments fa where fa.id=(p_payload->>'attachment_id')::uuid;
    when 'notify' then
      insert into public.notifications(user_id,type,title,body,entity_type,entity_id) values((p_payload->>'user_id')::uuid,p_payload->>'type',p_payload->>'title',p_payload->>'body',nullif(p_payload->>'entity_type',''),nullif(p_payload->>'entity_id',''));v_result:=jsonb_build_object('ok',true);
    when 'audit' then
      insert into public.audit_events(actor_user_id,action,entity_type,entity_id,before_values,after_values) values(nullif(p_payload->>'actor_user_id','')::uuid,p_payload->>'action',p_payload->>'entity_type',nullif(p_payload->>'entity_id',''),p_payload->'before_values',p_payload->'after_values');v_result:=jsonb_build_object('ok',true);
    else raise exception 'operación no permitida' using errcode='22023';
  end case;

  if v_entity is not null and p_payload?'attachment' then
    insert into public.financial_attachments(owner_user_id,entity_type,entity_id,storage_path,original_name,mime_type,size_bytes,sha256,metadata)
    values((p_payload->>'created_by')::uuid,v_entity,v_entity_id,p_payload#>>'{attachment,storage_path}',p_payload#>>'{attachment,original_name}',p_payload#>>'{attachment,mime_type}',(p_payload#>>'{attachment,size_bytes}')::bigint,p_payload#>>'{attachment,sha256}',coalesce(p_payload#>'{attachment,metadata}','{}'::jsonb)) returning id into v_attachment;
    if p_payload?'ai_proposal' then
      insert into public.ai_document_extractions(attachment_id,proposed_values,model,status) values(v_attachment,p_payload->'ai_proposal',nullif(p_payload->>'ai_model',''),'validated') returning id into v_extraction;
      insert into public.financial_validations(extraction_id,validator_user_id,corrected_values) values(v_extraction,(p_payload->>'created_by')::uuid,coalesce(p_payload->'corrected_values','{}'::jsonb));
    end if;
    v_result:=jsonb_build_object('record',v_result,'attachment_id',v_attachment);
  end if;
  return coalesce(v_result,'null'::jsonb);
end; $$;

revoke all on function private.misolar_family_backend(text,jsonb) from public,authenticated;
grant execute on function private.misolar_family_backend(text,jsonb) to anon;
