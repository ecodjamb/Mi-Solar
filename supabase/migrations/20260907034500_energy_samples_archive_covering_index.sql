-- Permite construir gráficos históricos sin visitar miles de páginas de la
-- tabla (donde además vive el payload original pesado de cada muestra).
create index if not exists energy_samples_archive_cover_idx
on public.energy_samples(site_id,sample_at)
include(solar_w,pv1_w,pv2_w,load_w,grid_w,grid_active,battery_charge_w,battery_discharge_w,battery_soc);

analyze public.energy_samples;
