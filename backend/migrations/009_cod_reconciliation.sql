create table if not exists cod_settlements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  statement_ref text not null,
  courier_name text not null,
  statement_date date not null,
  collected_amount numeric(12,2) not null check (collected_amount >= 0),
  fee numeric(12,2) not null default 0 check (fee >= 0),
  status text not null default 'open' check (status in ('open', 'matched', 'issue')),
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (shop_id, statement_ref)
);

create table if not exists cod_settlement_rows (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  settlement_id uuid not null references cod_settlements(id) on delete cascade,
  external_ref text not null,
  tracking_number text,
  order_id uuid references orders(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null check (status in ('matched', 'unmatched')),
  issue text,
  created_at timestamptz not null default now()
);

create index if not exists cod_settlements_shop_status_idx on cod_settlements (shop_id, status, created_at desc);
create index if not exists cod_settlement_rows_settlement_idx on cod_settlement_rows (shop_id, settlement_id, status);
