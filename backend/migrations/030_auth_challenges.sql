alter table users add column if not exists email_verified_at timestamptz;
alter table users add column if not exists phone_verified_at timestamptz;
alter table users add column if not exists password_changed_at timestamptz;

create table if not exists auth_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  purpose text not null check (purpose in ('email_verification', 'phone_verification', 'password_reset')),
  destination_type text not null check (destination_type in ('email', 'phone')),
  destination_hash text not null,
  code_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'used', 'expired')),
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_challenges_user_idx on auth_challenges (user_id, purpose, status, created_at desc);
create index if not exists auth_challenges_destination_idx on auth_challenges (purpose, destination_hash, status, created_at desc);
