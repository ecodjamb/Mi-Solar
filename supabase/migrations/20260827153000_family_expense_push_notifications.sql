-- Avisos familiares dirigidos por usuario. Las suscripciones existentes se
-- conservan y se asocian al único superadministrador activo de Mi Solar.

alter table public.push_subscriptions
  add column if not exists user_id uuid references public.app_users(id) on delete cascade;

update public.push_subscriptions
set user_id = (
  select u.id
  from public.app_users u
  join public.roles r on r.id = u.role_id
  where u.active = true and u.username = 'ecodjamb' and r.key = 'superadmin'
  limit 1
)
where user_id is null;

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id, created_at desc)
  where user_id is not null;

create table if not exists public.family_push_delivery_state (
  recipient_user_id uuid not null references public.app_users(id) on delete cascade,
  category text not null check (category in ('expense_pending_admin', 'expense_review_user')),
  last_sent_at timestamptz not null default now(),
  primary key (recipient_user_id, category)
);

alter table public.family_push_delivery_state enable row level security;
revoke all on public.family_push_delivery_state from public, anon, authenticated;

create or replace function private.misolar_family_push_claim_backend(
  p_recipient_user_id uuid,
  p_category text,
  p_cooldown_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer := 0;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode = '42501';
  end if;
  if p_recipient_user_id is null
     or p_category not in ('expense_pending_admin', 'expense_review_user') then
    raise exception 'destinatario o categoría inválida' using errcode = '22023';
  end if;

  insert into public.family_push_delivery_state(recipient_user_id, category, last_sent_at)
  values (p_recipient_user_id, p_category, now())
  on conflict (recipient_user_id, category) do update
    set last_sent_at = excluded.last_sent_at
    where public.family_push_delivery_state.last_sent_at
      <= now() - make_interval(secs => greatest(60, least(coalesce(p_cooldown_seconds, 300), 3600)));

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function private.misolar_family_push_claim_backend(uuid,text,integer) from public, authenticated;
grant execute on function private.misolar_family_push_claim_backend(uuid,text,integer) to anon;

create or replace function public.misolar_family_push_claim_backend(
  p_recipient_user_id uuid,
  p_category text,
  p_cooldown_seconds integer default 300
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.misolar_family_push_claim_backend(
    p_recipient_user_id,
    p_category,
    p_cooldown_seconds
  );
$$;

revoke all on function public.misolar_family_push_claim_backend(uuid,text,integer) from public, authenticated;
grant execute on function public.misolar_family_push_claim_backend(uuid,text,integer) to anon;

comment on column public.push_subscriptions.user_id is
  'Usuario de Mi Solar dueño del navegador o dispositivo suscrito.';
comment on table public.family_push_delivery_state is
  'Ventana atómica de cinco minutos para evitar avisos familiares repetidos.';
