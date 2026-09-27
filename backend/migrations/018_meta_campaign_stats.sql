alter table orders add column if not exists attribution_source text not null default 'unknown';
alter table orders add column if not exists attribution_campaign_id text;
alter table orders add column if not exists attribution_data jsonb not null default '{}'::jsonb;

create index if not exists orders_shop_attribution_idx on orders (shop_id, attribution_source, attribution_campaign_id, created_at desc);

create table if not exists meta_campaign_stats (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  connection_id uuid references meta_connections(id) on delete set null,
  campaign_id text not null,
  campaign_name text,
  metric_date date not null,
  spend numeric(12,2) not null default 0 check (spend >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  provider_attributed_orders integer not null default 0 check (provider_attributed_orders >= 0),
  provider_placed_revenue numeric(12,2) not null default 0 check (provider_placed_revenue >= 0),
  provider_delivered_revenue numeric(12,2) not null default 0 check (provider_delivered_revenue >= 0),
  attribution_status text not null default 'unknown' check (attribution_status in ('known', 'unknown')),
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, campaign_id, metric_date)
);

create index if not exists meta_campaign_stats_shop_date_idx on meta_campaign_stats (shop_id, metric_date desc);
