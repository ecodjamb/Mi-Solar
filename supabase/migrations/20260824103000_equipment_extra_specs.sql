-- Especificaciones técnicas pequeñas, flexibles y compatibles con los equipos
-- existentes. El JSON permite ampliar la ficha sin perder datos anteriores.
alter table public.equipment_assets
  add column if not exists extra_specs jsonb not null default '{}'::jsonb;

alter table public.equipment_assets
  drop constraint if exists equipment_assets_extra_specs_object_check;
alter table public.equipment_assets
  add constraint equipment_assets_extra_specs_object_check
  check (jsonb_typeof(extra_specs)='object');

comment on column public.equipment_assets.extra_specs is
  'Ficha técnica ampliable: voltaje, corriente, química/tipo, conexión, serie, garantía y otros datos breves.';
