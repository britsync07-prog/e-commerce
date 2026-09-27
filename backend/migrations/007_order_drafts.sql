create table if not exists order_drafts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'ready', 'confirmed', 'cancelled')),
  customer_snapshot jsonb not null default '{}'::jsonb,
  payment_method text not null default 'cod',
  risk_status text not null default 'safe' check (risk_status in ('safe', 'review', 'advance_required')),
  risk_reasons jsonb not null default '[]'::jsonb,
  confidence numeric(4,3) not null default 0.500 check (confidence >= 0 and confidence <= 1),
  created_by uuid references users(id),
  confirmed_order_id uuid references orders(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_draft_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  order_draft_id uuid not null references order_drafts(id) on delete cascade,
  variant_id uuid not null references product_variants(id),
  quantity integer not null check (quantity > 0),
  confidence numeric(4,3) not null default 0.500 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);

create index if not exists order_drafts_shop_status_idx on order_drafts (shop_id, status, created_at desc);
create index if not exists order_drafts_conversation_idx on order_drafts (conversation_id, created_at desc);
create index if not exists order_draft_items_draft_idx on order_draft_items (order_draft_id);
