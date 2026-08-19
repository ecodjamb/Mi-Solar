alter table public.automation_rules
  alter column notification_preferences set default jsonb_build_object(
    'automationExecuted', true,
    'automationState', true,
    'serviceOutage', true,
    'gridOutage', true,
    'solarSurplus', true
  );

update public.automation_rules
set notification_preferences = notification_preferences || '{"gridOutage": true}'::jsonb
where not (notification_preferences ? 'gridOutage');

alter table public.notification_events
  drop constraint if exists notification_events_event_type_check;

alter table public.notification_events
  add constraint notification_events_event_type_check
  check (event_type in (
    'automation_executed',
    'automation_state',
    'service_outage',
    'service_recovery',
    'grid_outage',
    'grid_recovery',
    'solar_surplus',
    'test'
  ));

comment on column public.automation_rules.notification_preferences is
  'Preferencias de avisos push por instalación, incluidos corte y recuperación de red.';
