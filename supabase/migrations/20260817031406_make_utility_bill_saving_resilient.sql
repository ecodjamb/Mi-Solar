alter table public.utility_bills
  add column if not exists estimate_method text not null default 'unknown',
  add column if not exists estimated_unit_rate_clp numeric(10,2) not null default 250,
  add column if not exists rate_method text not null default 'unavailable';

alter table public.utility_bills drop constraint if exists utility_bills_estimate_method_check;
alter table public.utility_bills add constraint utility_bills_estimate_method_check check (
  estimate_method in ('reported', 'bill-estimate', 'amount-divided-by-250', 'misolar-archive', 'minimum-fallback', 'unknown')
);
alter table public.utility_bills drop constraint if exists utility_bills_estimated_unit_rate_check;
alter table public.utility_bills add constraint utility_bills_estimated_unit_rate_check
  check (estimated_unit_rate_clp > 0);
alter table public.utility_bills drop constraint if exists utility_bills_rate_method_check;
alter table public.utility_bills add constraint utility_bills_rate_method_check
  check (rate_method in ('energy-transport', 'total-amount', 'unavailable'));

update public.utility_bills
set estimate_method = case
  when reported_kwh > 0 then 'reported'
  when estimated_kwh > 0 and amount_clp > 0 and abs(estimated_kwh - amount_clp / 250.0) < 0.02 then 'amount-divided-by-250'
  when estimated_kwh > 0 then 'misolar-archive'
  else 'unknown'
end,
rate_method = case
  when coalesce(reported_kwh, estimated_kwh) > 0 and energy_charge_clp is not null then 'energy-transport'
  when coalesce(reported_kwh, estimated_kwh) > 0 and amount_clp > 0 then 'total-amount'
  else 'unavailable'
end;

alter table public.utility_bills drop column if exists effective_rate_clp;
alter table public.utility_bills add column effective_rate_clp numeric(14,2) generated always as (
  case
    when coalesce(reported_kwh, estimated_kwh) > 0 and energy_charge_clp is not null
      then (coalesce(energy_charge_clp, 0) + coalesce(transport_charge_clp, 0)) / coalesce(reported_kwh, estimated_kwh)
    when coalesce(reported_kwh, estimated_kwh) > 0 and amount_clp > 0
      then amount_clp / coalesce(reported_kwh, estimated_kwh)
    else null
  end
) stored;

comment on column public.utility_bills.estimate_method is
  'Método que produjo el consumo mostrado: real, estimación de la boleta, monto/250, archivo Mi Solar o mínimo técnico.';
comment on column public.utility_bills.estimated_unit_rate_clp is
  'Supuesto explícito de 250 CLP/kWh usado cuando solo existe el monto total de la cuenta.';
comment on column public.utility_bills.rate_method is
  'Método tarifario: energía+traslado, monto total/consumo o no disponible.';
