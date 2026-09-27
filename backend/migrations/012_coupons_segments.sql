create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  min_order_total numeric(12,2) not null default 0 check (min_order_total >= 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, code)
);

alter table orders add column if not exists discount_amount numeric(12,2) not null default 0;
alter table orders add column if not exists coupon_id uuid references coupons(id) on delete set null;

create table if not exists coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  coupon_id uuid not null references coupons(id) on delete restrict,
  order_id uuid not null references orders(id) on delete restrict,
  customer_id uuid references customers(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (shop_id, coupon_id, order_id)
);

create table if not exists customer_segments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  definition jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, name)
);

create index if not exists coupons_shop_status_idx on coupons (shop_id, status, expires_at);
create index if not exists coupon_redemptions_coupon_idx on coupon_redemptions (shop_id, coupon_id, created_at desc);
create index if not exists customer_segments_shop_idx on customer_segments (shop_id, created_at desc);
