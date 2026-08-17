update public.utility_bills as bill
set period_start = date '2026-03-21',
    ai_extraction = jsonb_set(
      jsonb_set(bill.ai_extraction, '{periodStart}', '"2026-03-21"'::jsonb, true),
      '{periodCorrection}',
      '"Período verificado por el usuario: 21 de marzo al 22 de abril de 2026."'::jsonb,
      true
    ),
    updated_at = now()
from public.solar_sites as site
where bill.site_id = site.id
  and site.device_sn = '96342509120972'
  and bill.invoice_number = '367168321'
  and bill.period_end = date '2026-04-22';
