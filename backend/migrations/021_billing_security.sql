create table if not exists billing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  monthly_price numeric(12,2) not null check (monthly_price >= 0),
  limits jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into billing_plans (code, name, monthly_price, limits) values
  ('starter', 'Starter', 0, '{"staff": 2, "products": 1000, "orders_per_month": 1000, "storage_bytes": 1073741824}'),
  ('growth', 'Growth', 29, '{"staff": 10, "products": 10000, "orders_per_month": 10000, "storage_bytes": 10737418240}')
on conflict (code) do nothing;
create table if not exists shop_billing (
  shop_id uuid primary key references shops(id) on delete cascade,
  plan_id uuid not null references billing_plans(id),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'cancelled')),
  current_period_start date not null default current_date,
  current_period_end date not null default (current_date + interval '30 days'),
  external_customer_ref text,
  updated_at timestamptz not null default now()
);
create table if not exists billing_invoices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null,
  status text not null check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
  external_invoice_ref text,
  created_at timestamptz not null default now(),
  unique (shop_id, period_start, period_end)
);
create table if not exists auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  event_type text not null,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists billing_invoices_shop_idx on billing_invoices (shop_id, created_at desc);
create index if not exists auth_events_user_idx on auth_events (user_id, created_at desc);
