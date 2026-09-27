create table if not exists payment_records (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  order_id uuid not null references orders(id) on delete restrict,
  method text not null check (method in ('cod', 'advance', 'manual')),
  status text not null check (status in ('pending', 'marked_paid', 'refunded', 'failed')),
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null,
  proof_asset_id uuid references asset_objects(id) on delete set null,
  marked_paid_at timestamptz,
  refunded_at timestamptz,
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  payment_id uuid not null references payment_records(id) on delete restrict,
  order_id uuid not null references orders(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'marked_paid', 'refunded', 'failed')),
  amount numeric(12,2) not null check (amount > 0),
  note text,
  actor_id uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists payment_records_shop_status_idx on payment_records (shop_id, status, created_at desc);
create index if not exists payment_records_order_idx on payment_records (shop_id, order_id, created_at desc);
create index if not exists payment_events_payment_idx on payment_events (shop_id, payment_id, created_at asc);
