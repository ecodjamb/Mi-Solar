-- Frontera transaccional del módulo familiar. No acepta nombres de tabla ni
-- SQL arbitrario; todas las operaciones están enumeradas.
create or replace function public.misolar_family_backend(p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_id bigint; v_loan public.family_loans%rowtype; v_amount bigint; v_paid bigint; v_status text;
begin
  if not (select private.request_is_misolar()) then raise exception 'backend no autorizado' using errcode='42501'; end if;
  case p_operation
    when 'dashboard' then
      select jsonb_build_object(
        'users',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'username',username,'active',active) order by display_name),'[]'::jsonb) from public.app_users where (p_payload->>'admin')::boolean or id=(p_payload->>'user_id')::uuid),
        'allowances',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) from public.allowances a where (p_payload->>'admin')::boolean or a.beneficiary_user_id=(p_payload->>'user_id')::uuid or a.responsible_user_id=(p_payload->>'user_id')::uuid),
        'obligations',(select coalesce(jsonb_agg(to_jsonb(o) order by o.due_on desc),'[]'::jsonb) from public.allowance_obligations o join public.allowances a on a.id=o.allowance_id where (p_payload->>'admin')::boolean or a.beneficiary_user_id=(p_payload->>'user_id')::uuid or a.responsible_user_id=(p_payload->>'user_id')::uuid),
        'loans',(select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc),'[]'::jsonb) from public.family_loans l where (p_payload->>'admin')::boolean or l.lender_user_id=(p_payload->>'user_id')::uuid or l.borrower_user_id=(p_payload->>'user_id')::uuid),
        'payments',(select coalesce(jsonb_agg(to_jsonb(lp) order by lp.payment_date desc),'[]'::jsonb) from public.loan_payments lp join public.family_loans l on l.id=lp.loan_id where lp.status<>'void' and ((p_payload->>'admin')::boolean or l.lender_user_id=(p_payload->>'user_id')::uuid or l.borrower_user_id=(p_payload->>'user_id')::uuid)),
        'accounts',(select coalesce(jsonb_agg(to_jsonb(ea)),'[]'::jsonb) from public.expense_accounts ea where (p_payload->>'admin')::boolean or ea.user_id=(p_payload->>'user_id')::uuid),
        'movements',(select coalesce(jsonb_agg(to_jsonb(em) order by em.movement_date desc,em.movement_number desc),'[]'::jsonb) from public.expense_movements em join public.expense_accounts ea on ea.id=em.account_id where (p_payload->>'admin')::boolean or ea.user_id=(p_payload->>'user_id')::uuid),
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
    when 'account_get' then
      select to_jsonb(a) into v_result from public.expense_accounts a where id=(p_payload->>'account_id')::bigint;
    when 'movement_create' then
      insert into public.expense_movements(account_id,movement_date,detail,income_minor,expense_minor,currency,status,created_by)
      values((p_payload->>'account_id')::bigint,(p_payload->>'movement_date')::date,p_payload->>'detail',(p_payload->>'income_minor')::bigint,(p_payload->>'expense_minor')::bigint,p_payload->>'currency',coalesce(p_payload->>'status','pending'),(p_payload->>'created_by')::uuid)
      returning id into v_id; select to_jsonb(m) into v_result from public.expense_movements m where id=v_id;
    when 'loan_create' then
      insert into public.family_loans(lender_user_id,borrower_user_id,loan_date,original_amount_minor,currency,detail,due_date,created_by)
      values((p_payload->>'lender_user_id')::uuid,(p_payload->>'borrower_user_id')::uuid,(p_payload->>'loan_date')::date,(p_payload->>'original_amount_minor')::bigint,coalesce(p_payload->>'currency','CLP'),p_payload->>'detail',nullif(p_payload->>'due_date','')::date,(p_payload->>'created_by')::uuid)
      returning id into v_id; select to_jsonb(l) into v_result from public.family_loans l where id=v_id;
    when 'loan_get' then select to_jsonb(l) into v_result from public.family_loans l where id=(p_payload->>'loan_id')::bigint;
    when 'loan_payment' then
      select * into v_loan from public.family_loans where id=(p_payload->>'loan_id')::bigint for update;
      if not found then raise exception 'préstamo no encontrado' using errcode='P0002'; end if;
      v_amount:=(p_payload->>'amount_minor')::bigint;
      if v_amount<=0 then raise exception 'monto inválido' using errcode='22003'; end if;
      if v_loan.paid_amount_minor+v_amount>v_loan.original_amount_minor and not coalesce((p_payload->>'allow_overpayment')::boolean,false) then raise exception 'pago superior al saldo' using errcode='22003'; end if;
      insert into public.loan_payments(loan_id,amount_minor,payment_date,detail,created_by,idempotency_key)
      values(v_loan.id,v_amount,(p_payload->>'payment_date')::date,nullif(p_payload->>'detail',''),(p_payload->>'created_by')::uuid,p_payload->>'idempotency_key')
      on conflict(idempotency_key) do nothing returning id into v_id;
      if v_id is null then select to_jsonb(lp) into v_result from public.loan_payments lp where idempotency_key=p_payload->>'idempotency_key'; return v_result; end if;
      select coalesce(sum(amount_minor),0) into v_paid from public.loan_payments where loan_id=v_loan.id and status='confirmed';
      v_status:=case when v_paid>=v_loan.original_amount_minor then 'paid' when v_paid>0 then 'partially_paid' else 'pending' end;
      update public.family_loans set paid_amount_minor=v_paid,status=v_status,updated_at=now() where id=v_loan.id;
      select jsonb_build_object('payment',to_jsonb(lp),'loan',(select to_jsonb(l) from public.family_loans l where l.id=v_loan.id)) into v_result from public.loan_payments lp where lp.id=v_id;
    when 'notify' then
      insert into public.notifications(user_id,type,title,body,entity_type,entity_id)
      values((p_payload->>'user_id')::uuid,p_payload->>'type',p_payload->>'title',p_payload->>'body',nullif(p_payload->>'entity_type',''),nullif(p_payload->>'entity_id',''));
      v_result:=jsonb_build_object('ok',true);
    when 'audit' then
      insert into public.audit_events(actor_user_id,action,entity_type,entity_id,before_values,after_values)
      values(nullif(p_payload->>'actor_user_id','')::uuid,p_payload->>'action',p_payload->>'entity_type',nullif(p_payload->>'entity_id',''),p_payload->'before_values',p_payload->'after_values');
      v_result:=jsonb_build_object('ok',true);
    else raise exception 'operación no permitida' using errcode='22023';
  end case;
  return coalesce(v_result,'null'::jsonb);
end; $$;
revoke all on function public.misolar_family_backend(text,jsonb) from public,authenticated;
grant execute on function public.misolar_family_backend(text,jsonb) to anon;
