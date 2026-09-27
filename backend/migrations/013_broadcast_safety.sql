create table if not exists broadcasts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  segment_id uuid not null references customer_segments(id) on delete restrict,
  channel text not null check (channel in ('messenger', 'instagram')),
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'cancelled')),
  rate_limit_per_minute integer not null default 20 check (rate_limit_per_minute between 1 and 100),
  audience_count integer,
  approval_reason text,
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists broadcasts_shop_status_idx on broadcasts (shop_id, status, created_at desc);
