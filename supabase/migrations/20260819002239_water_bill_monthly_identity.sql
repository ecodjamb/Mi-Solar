alter table public.water_bills
  add column if not exists billing_month date;

update public.water_bills
set billing_month = date_trunc('month', coalesce(issue_date, period_end))::date
where billing_month is null;

alter table public.water_bills
  alter column billing_month set not null;

alter table public.water_bills
  drop constraint if exists water_bills_billing_month_first_day_check;

alter table public.water_bills
  add constraint water_bills_billing_month_first_day_check
  check (billing_month = date_trunc('month', billing_month)::date);

alter table public.water_bills
  drop constraint if exists water_bills_site_id_period_start_period_end_key;

create unique index if not exists water_bills_site_month_key
  on public.water_bills (site_id, billing_month);

create index if not exists water_bills_site_reading_span_idx
  on public.water_bills (site_id, period_end desc, period_start desc);

comment on column public.water_bills.billing_month is
  'Mes comercial de la boleta. Es independiente del intervalo entre lecturas cuando la empresa regulariza consumos estimados anteriores.';
