alter table users add column if not exists password_hash text;
alter table users add column if not exists status text not null default 'active' check (status in ('active', 'disabled'));

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip_address text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_sessions_user_active_idx on user_sessions (user_id, expires_at) where revoked_at is null;

