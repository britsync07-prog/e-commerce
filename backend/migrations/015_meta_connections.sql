create table if not exists meta_connections (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  page_id text,
  instagram_account_id text,
  credential_ref text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  last_verified_at timestamptz,
  last_webhook_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (page_id is not null or instagram_account_id is not null),
  unique (shop_id, page_id, instagram_account_id)
);

create index if not exists meta_connections_shop_idx on meta_connections (shop_id, created_at desc);
