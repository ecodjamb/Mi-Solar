-- Las notificaciones de la piscina deben quedar en el mismo historial que las
-- demás alertas de Mi Solar. No cambia privilegios ni expone funciones nuevas.
alter table public.notification_events drop constraint if exists notification_events_event_type_check;
alter table public.notification_events add constraint notification_events_event_type_check check (event_type in (
  'automation_executed','automation_state','service_outage','service_recovery',
  'grid_outage','grid_recovery','solar_surplus','test','water_reading_reminder',
  'water_reading_reminder_test','utility_reading_reminder','pool_circuit_started',
  'pool_a1_on','pool_a2_on','pool_a2_off','pool_a1_off','pool_errors'
));

comment on column public.notification_events.event_type is
  'Tipo de aviso push, incluidos recordatorios, proveedores y automatización de piscina.';
