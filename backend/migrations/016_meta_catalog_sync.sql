create table if not exists meta_catalog_syncs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  connection_id uuid not null references meta_connections(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'manual_required')),
  settings jsonb not null default '{"skipUnpublished": true, "skipOutOfStock": true}'::jsonb,
  products_count integer not null default 0,
  skipped_count integer not null default 0,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_error text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id)
);

create index if not exists meta_catalog_syncs_connection_idx on meta_catalog_syncs (connection_id, updated_at desc);
