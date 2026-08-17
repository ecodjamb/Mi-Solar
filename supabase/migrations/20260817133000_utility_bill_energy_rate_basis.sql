alter table public.utility_bills
  add column if not exists charge_items jsonb not null default '[]'::jsonb;

alter table public.utility_bills drop constraint if exists utility_bills_charge_items_array_check;
alter table public.utility_bills add constraint utility_bills_charge_items_array_check
  check (jsonb_typeof(charge_items) = 'array');

comment on column public.utility_bills.energy_charge_clp is
  'Monto exclusivo del cargo variable por energía consumida; base para calcular CLP/kWh. Excluye cargos fijos, impuestos, deuda, intereses, ajustes y descuentos.';
comment on column public.utility_bills.charge_items is
  'Desglose visible completo de la cuenta, incluidos cargos, impuestos, descuentos, deuda, repactaciones, intereses y ajustes, con indicación de qué líneas forman la base energética.';
