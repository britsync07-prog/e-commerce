create table if not exists legal_policies (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  policy_type text not null check (policy_type in ('privacy_policy', 'terms_conditions', 'refund_policy', 'shipping_policy', 'cookie_policy')),
  title text not null,
  body text not null,
  version integer not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, policy_type, version)
);

create table if not exists cookie_consents (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  visitor_id text,
  consent_id text not null,
  categories jsonb not null,
  policy_version integer,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now(),
  unique (shop_id, consent_id)
);

create table if not exists privacy_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  request_type text not null check (request_type in ('access', 'delete', 'correct', 'opt_out')),
  status text not null default 'open' check (status in ('open', 'reviewing', 'completed', 'rejected')),
  requester_name text,
  requester_email text,
  requester_phone text,
  customer_id uuid references customers(id) on delete set null,
  details text,
  resolution_note text,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists legal_policies_shop_type_idx on legal_policies (shop_id, policy_type, status, version desc);
create index if not exists cookie_consents_shop_created_idx on cookie_consents (shop_id, created_at desc);
create index if not exists privacy_requests_shop_status_idx on privacy_requests (shop_id, status, created_at desc);
