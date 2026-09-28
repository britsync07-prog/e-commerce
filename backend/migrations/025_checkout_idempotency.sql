create table if not exists api_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null check (status in ('processing', 'completed')),
  response_body jsonb,
  created_at timestamptz not null default now(),
  unique (shop_id, operation, idempotency_key)
);

create index if not exists api_idempotency_keys_created_idx on api_idempotency_keys (created_at);
