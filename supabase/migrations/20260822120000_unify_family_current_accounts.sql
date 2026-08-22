-- Unifica mesadas, gastos puntuales y depósitos en la cuenta corriente familiar.
-- Es aditiva: conserva obligaciones, pagos, movimientos y comprobantes existentes.
alter table public.expense_movements
  add column if not exists allowance_obligation_id bigint
    references public.allowance_obligations(id) on delete restrict;

alter table public.expense_movements
  drop constraint if exists expense_movements_movement_type_check;
alter table public.expense_movements
  add constraint expense_movements_movement_type_check
  check (movement_type in ('expense_report','expense','deposit','allowance_charge'));

create unique index if not exists expense_movements_allowance_obligation_uidx
  on public.expense_movements(allowance_obligation_id)
  where allowance_obligation_id is not null;
create index if not exists expense_movements_account_approved_date_idx
  on public.expense_movements(account_id,movement_date desc,movement_number desc)
  where status='approved';

create or replace function private.post_allowance_charge_to_current_account()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_allowance public.allowances%rowtype;
  v_account_id bigint;
begin
  select * into strict v_allowance
  from public.allowances
  where id=new.allowance_id;

  insert into public.expense_accounts(user_id,name,currency,active)
  values(v_allowance.beneficiary_user_id,'Cuenta corriente familiar',v_allowance.currency,true)
  on conflict(user_id,currency) do update
    set active=true,
        name=case when public.expense_accounts.name='Rendición de gastos'
          then 'Cuenta corriente familiar' else public.expense_accounts.name end
  returning id into v_account_id;

  insert into public.expense_movements(
    account_id,movement_date,detail,income_minor,expense_minor,currency,status,
    created_by,approved_by,movement_type,depositor_user_id,recipient_user_id,
    merchant_name,allowance_obligation_id,reviewed_at
  ) values (
    v_account_id,new.due_on,
    coalesce(nullif(v_allowance.notes,''),'Mesada recurrente'),
    0,new.amount_minor,v_allowance.currency,'approved',
    coalesce(v_allowance.created_by,v_allowance.responsible_user_id),
    coalesce(v_allowance.created_by,v_allowance.responsible_user_id),
    'allowance_charge',v_allowance.responsible_user_id,v_allowance.beneficiary_user_id,
    'Mesada programada',new.id,now()
  ) on conflict(allowance_obligation_id)
    where allowance_obligation_id is not null do nothing;

  return new;
end;
$$;

revoke all on function private.post_allowance_charge_to_current_account() from public,anon,authenticated;

drop trigger if exists allowance_obligation_posts_current_account on public.allowance_obligations;
create trigger allowance_obligation_posts_current_account
after insert on public.allowance_obligations
for each row execute function private.post_allowance_charge_to_current_account();

-- Respaldar también obligaciones históricas que aún no tenían asiento contable.
insert into public.expense_accounts(user_id,name,currency,active)
select distinct a.beneficiary_user_id,'Cuenta corriente familiar',a.currency,true
from public.allowance_obligations o
join public.allowances a on a.id=o.allowance_id
where o.status<>'void'
on conflict(user_id,currency) do update
set active=true,
    name=case when public.expense_accounts.name='Rendición de gastos'
      then 'Cuenta corriente familiar' else public.expense_accounts.name end;

insert into public.expense_movements(
  account_id,movement_date,detail,income_minor,expense_minor,currency,status,
  created_by,approved_by,movement_type,depositor_user_id,recipient_user_id,
  merchant_name,allowance_obligation_id,reviewed_at
)
select ea.id,o.due_on,coalesce(nullif(a.notes,''),'Mesada recurrente'),0,o.amount_minor,
  a.currency,'approved',coalesce(a.created_by,a.responsible_user_id),
  coalesce(a.created_by,a.responsible_user_id),'allowance_charge',
  a.responsible_user_id,a.beneficiary_user_id,'Mesada programada',o.id,now()
from public.allowance_obligations o
join public.allowances a on a.id=o.allowance_id
join public.expense_accounts ea on ea.user_id=a.beneficiary_user_id and ea.currency=a.currency
where o.status<>'void'
on conflict(allowance_obligation_id)
  where allowance_obligation_id is not null do nothing;
