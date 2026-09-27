create table if not exists courier_accounts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  provider text not null default 'manual',
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'failed')),
  settings jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  courier_account_id uuid references courier_accounts(id),
  provider text not null default 'manual',
  status text not null check (status in ('booked', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned', 'cancelled')),
  courier_name text not null,
  tracking_number text,
  fee numeric(12,2) not null default 0 check (fee >= 0),
  booking_source text not null default 'manual' check (booking_source in ('manual', 'api')),
  booked_by uuid references users(id),
  booked_at timestamptz not null default now(),
  last_sync_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shipment_tracking_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  shipment_id uuid not null references shipments(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  source text not null check (source in ('manual', 'api', 'webhook')),
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

create unique index if not exists shipments_order_open_idx on shipments (shop_id, order_id)
where status not in ('cancelled', 'returned');

create index if not exists shipments_shop_status_idx on shipments (shop_id, status, created_at desc);
create index if not exists shipment_tracking_events_shipment_idx on shipment_tracking_events (shipment_id, created_at desc);
