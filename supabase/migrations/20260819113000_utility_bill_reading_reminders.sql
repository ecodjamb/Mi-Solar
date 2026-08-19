create table if not exists public.utility_bill_reminder_settings (
  site_id bigint primary key references public.solar_sites(id) on delete cascade,
  enabled boolean not null default false,
  notify_day_before boolean not null default true,
  notify_same_day boolean not null default true,
  notification_time_local time without time zone not null default '09:00:00',
  updated_at timestamptz not null default now(),
  constraint utility_bill_reminder_has_notice check (not enabled or notify_day_before or notify_same_day)
);

alter table public.utility_bill_reminder_settings enable row level security;
revoke all on public.utility_bill_reminder_settings from public, anon, authenticated;
grant select, insert, update on public.utility_bill_reminder_settings to anon;

drop policy if exists misolar_backend_utility_bill_reminder_settings_all on public.utility_bill_reminder_settings;
create policy misolar_backend_utility_bill_reminder_settings_all on public.utility_bill_reminder_settings
  for all to anon
  using ((select private.request_is_misolar()))
  with check ((select private.request_is_misolar()));

alter table public.notification_events drop constraint if exists notification_events_event_type_check;
alter table public.notification_events add constraint notification_events_event_type_check check (
  event_type in (
    'automation_executed','automation_state','service_outage','service_recovery',
    'grid_outage','grid_recovery','solar_surplus','test',
    'water_reading_reminder','water_reading_reminder_test',
    'utility_reading_reminder'
  )
);

comment on table public.utility_bill_reminder_settings is
  'Preferencias persistentes para avisar el ingreso de la próxima lectura eléctrica estimada.';
