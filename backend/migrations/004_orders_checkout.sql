create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  phone text not null,
  language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, phone)
);

create table if not exists customer_addresses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  address text not null,
  city text,
  area text,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid references customers(id),
  source text not null check (source in ('storefront', 'chat', 'manual')),
  status text not null check (status in ('new', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned')),
  payment_method text not null default 'cod',
  currency char(3) not null,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  delivery_charge numeric(12,2) not null default 0 check (delivery_charge >= 0),
  total numeric(12,2) not null check (total >= 0),
  buyer_snapshot jsonb not null,
  risk_status text not null default 'safe' check (risk_status in ('safe', 'review', 'advance_required')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  variant_id uuid not null references product_variants(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  product_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists order_timeline (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  actor_type text not null,
  actor_id text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists customers_shop_phone_idx on customers (shop_id, phone);
create index if not exists orders_shop_status_idx on orders (shop_id, status, created_at desc);
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_timeline_order_idx on order_timeline (order_id, created_at desc);

