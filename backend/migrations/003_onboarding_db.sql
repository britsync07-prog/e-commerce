alter table shops add column if not exists onboarding_step text not null default 'products';
alter table shops add column if not exists address text;
alter table shops add column if not exists logo_url text;

create table if not exists shop_channels (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  provider text not null check (provider in ('meta', 'instagram', 'whatsapp', 'courier')),
  status text not null check (status in ('skipped', 'pending', 'connected', 'failed')),
  reason text,
  created_at timestamptz not null default now(),
  unique (shop_id, provider)
);

create index if not exists shop_channels_shop_idx on shop_channels (shop_id);

