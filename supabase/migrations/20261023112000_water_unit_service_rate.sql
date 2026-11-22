alter table public.water_settings
  add column if not exists unit_service_rate_clp integer not null default 1500
  check (unit_service_rate_clp between 1 and 100000);

update public.water_settings
set unit_service_rate_clp = 1500
where unit_service_rate_clp is distinct from 1500;

comment on column public.water_settings.unit_service_rate_clp is
  'Valor editable en pesos chilenos por metro cúbico usado para el seguimiento y las proyecciones del período de agua en curso.';
