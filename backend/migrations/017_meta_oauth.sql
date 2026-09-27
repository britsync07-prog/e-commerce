alter table meta_connections add column if not exists encrypted_access_token text;

create table if not exists meta_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  shop_id uuid not null references shops(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'awaiting_page', 'used', 'failed')),
  user_token_ciphertext text,
  pages jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists meta_oauth_states_shop_idx on meta_oauth_states (shop_id, created_at desc);
