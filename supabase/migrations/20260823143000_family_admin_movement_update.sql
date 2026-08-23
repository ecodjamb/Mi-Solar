-- Operación estrecha para editar un único movimiento familiar existente.
-- La autorización de superadministrador se valida previamente en el backend.
-- No cambia roles, cuentas ni permisos y no elimina registros.
create or replace function public.misolar_family_movement_update_backend(
  p_movement_id bigint,
  p_movement_date date,
  p_detail text,
  p_income_minor bigint,
  p_expense_minor bigint,
  p_merchant_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode='42501';
  end if;
  if p_movement_id is null or p_movement_date is null or nullif(btrim(p_detail),'') is null then
    raise exception 'datos incompletos' using errcode='22023';
  end if;
  if p_income_minor<0 or p_expense_minor<0 or ((p_income_minor>0)=(p_expense_minor>0)) then
    raise exception 'monto inválido' using errcode='22003';
  end if;
  update public.expense_movements
  set movement_date=p_movement_date,detail=btrim(p_detail),income_minor=p_income_minor,
      expense_minor=p_expense_minor,merchant_name=nullif(btrim(p_merchant_name),''),updated_at=now()
  where id=p_movement_id and status<>'void' and movement_type<>'allowance_charge'
  returning to_jsonb(public.expense_movements.*) into v_result;
  return coalesce(v_result,'null'::jsonb);
end;
$$;
revoke all on function public.misolar_family_movement_update_backend(bigint,date,text,bigint,bigint,text) from public,authenticated;
grant execute on function public.misolar_family_movement_update_backend(bigint,date,text,bigint,bigint,text) to anon;
