alter table public.utility_bills
  add column if not exists estimated_kwh numeric(14,2),
  add column if not exists consumption_status text not null default 'pending',
  add column if not exists transport_charge_clp numeric(14,2);

alter table public.utility_bills drop constraint if exists utility_bills_estimated_kwh_check;
alter table public.utility_bills add constraint utility_bills_estimated_kwh_check
  check (estimated_kwh is null or estimated_kwh >= 0);
alter table public.utility_bills drop constraint if exists utility_bills_consumption_status_check;
alter table public.utility_bills add constraint utility_bills_consumption_status_check
  check (consumption_status in ('actual', 'estimated', 'pending'));
alter table public.utility_bills drop constraint if exists utility_bills_transport_charge_check;
alter table public.utility_bills add constraint utility_bills_transport_charge_check
  check (transport_charge_clp is null or transport_charge_clp >= 0);

update public.utility_bills as bill
set transport_charge_clp = (
  select sum(greatest(0, (item->>'amountClp')::numeric)) as total
  from jsonb_array_elements(bill.charge_items) as item
  where item->>'category' = 'transport'
)
where bill.transport_charge_clp is null
  and exists (select 1 from jsonb_array_elements(bill.charge_items) as item where item->>'category' = 'transport');

update public.utility_bills
set consumption_status = case
  when reported_kwh is not null and reported_kwh > 0 then 'actual'
  when estimated_kwh is not null and estimated_kwh > 0 then 'estimated'
  when theoretical_grid_kwh > 0 then 'estimated'
  else 'pending'
end,
estimated_kwh = case
  when reported_kwh is null and estimated_kwh is null and theoretical_grid_kwh > 0 then theoretical_grid_kwh
  else estimated_kwh
end;

alter table public.utility_bills
  add column if not exists period_days integer generated always as ((period_end - period_start) + 1) stored,
  add column if not exists average_daily_kwh numeric(14,3) generated always as (
    case
      when coalesce(reported_kwh, estimated_kwh) is null then null
      else coalesce(reported_kwh, estimated_kwh) / nullif((period_end - period_start) + 1, 0)
    end
  ) stored,
  add column if not exists rate_base_clp numeric(14,2) generated always as (
    case
      when energy_charge_clp is null and transport_charge_clp is null then null
      else coalesce(energy_charge_clp, 0) + coalesce(transport_charge_clp, 0)
    end
  ) stored,
  add column if not exists effective_rate_clp numeric(14,2) generated always as (
    case
      when coalesce(reported_kwh, estimated_kwh) > 0 and energy_charge_clp is not null
        then (coalesce(energy_charge_clp, 0) + coalesce(transport_charge_clp, 0)) / coalesce(reported_kwh, estimated_kwh)
      else null
    end
  ) stored;

comment on column public.utility_bills.estimated_kwh is
  'Consumo asumido por la boleta o, si no está visible, estimado desde el archivo de Mi Solar. Se conserva separado del consumo real.';
comment on column public.utility_bills.consumption_status is
  'Clasifica el consumo mostrado como actual, estimado o pendiente.';
comment on column public.utility_bills.transport_charge_clp is
  'Costo de transporte, transmisión o distribución incluido junto al cargo de energía para calcular CLP/kWh.';
comment on column public.utility_bills.average_daily_kwh is
  'Promedio diario persistente del consumo real o estimado durante el período de facturación.';
