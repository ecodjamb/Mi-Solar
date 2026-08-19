alter table public.notification_events drop constraint if exists notification_events_event_type_check;
alter table public.notification_events add constraint notification_events_event_type_check check (
  event_type in (
    'automation_executed','automation_state','service_outage','service_recovery',
    'grid_outage','grid_recovery','solar_surplus','test',
    'water_reading_reminder','water_reading_reminder_test'
  )
);

comment on column public.notification_events.event_type is
  'Tipo de aviso push, incluidos recordatorios de lectura del medidor de agua.';
