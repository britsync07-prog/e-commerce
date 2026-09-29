create table if not exists order_checkout_links (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  order_draft_id uuid not null references order_drafts(id) on delete cascade,
  token text not null unique,
  status text not null default 'active' check (status in ('active', 'used', 'expired', 'revoked')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists order_checkout_links_shop_idx on order_checkout_links (shop_id, status, expires_at);
create index if not exists order_checkout_links_draft_idx on order_checkout_links (order_draft_id, created_at desc);
