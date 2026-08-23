-- Edición/anulación auditable para finanzas familiares.
-- Ningún movimiento financiero se elimina físicamente.
create or replace function public.misolar_family_mutations_backend(
  p_operation text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_allowance public.allowances%rowtype;
  v_movement public.expense_movements%rowtype;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode='42501';
  end if;

  case p_operation
    when 'allowance_get' then
      select * into v_allowance
      from public.allowances
      where id=(p_payload->>'allowance_id')::bigint;
      if not found then v_result:=null; else v_result:=to_jsonb(v_allowance); end if;

    when 'allowance_update' then
      update public.allowances
      set responsible_user_id=(p_payload->>'responsible_user_id')::uuid,
          amount_minor=(p_payload->>'amount_minor')::bigint,
          frequency=p_payload->>'frequency',
          pay_day=nullif(p_payload->>'pay_day','')::smallint,
          custom_interval_days=nullif(p_payload->>'custom_interval_days','')::smallint,
          starts_on=(p_payload->>'starts_on')::date,
          notes=nullif(btrim(p_payload->>'notes'),''),
          status='active',
          updated_at=now()
      where id=(p_payload->>'allowance_id')::bigint
        and status<>'ended'
      returning to_jsonb(public.allowances.*) into v_result;

    when 'allowance_end' then
      update public.allowances
      set status='ended',updated_at=now()
      where id=(p_payload->>'allowance_id')::bigint
        and status<>'ended'
      returning to_jsonb(public.allowances.*) into v_result;

    when 'movement_get' then
      select * into v_movement
      from public.expense_movements
      where id=(p_payload->>'movement_id')::bigint;
      if not found then v_result:=null; else v_result:=to_jsonb(v_movement); end if;

    when 'movement_void' then
      select * into v_movement
      from public.expense_movements
      where id=(p_payload->>'movement_id')::bigint
      for update;
      if not found then
        v_result:=null;
      elsif v_movement.status='void' then
        v_result:=jsonb_build_object('before',to_jsonb(v_movement),'after',to_jsonb(v_movement));
      else
        update public.expense_movements em
        set status='void',review_note=nullif(p_payload->>'reason',''),updated_at=now()
        where em.id=v_movement.id
        returning jsonb_build_object('before',to_jsonb(v_movement),'after',to_jsonb(em))
        into v_result;
      end if;

    else
      raise exception 'operación no permitida' using errcode='22023';
  end case;
  return coalesce(v_result,'null'::jsonb);
end;
$$;

revoke all on function public.misolar_family_mutations_backend(text,jsonb)
  from public,authenticated;
grant execute on function public.misolar_family_mutations_backend(text,jsonb)
  to anon;
