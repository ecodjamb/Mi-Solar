alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_key;
alter table public.push_subscriptions
  add constraint push_subscriptions_site_endpoint_key unique (site_id, endpoint);
