alter table customers add column if not exists consent_status text not null default 'unknown';
alter table customers add column if not exists consent_updated_at timestamptz;
alter table customers drop constraint if exists customers_consent_status_check;
alter table customers add constraint customers_consent_status_check check (consent_status in ('unknown', 'opted_in', 'opted_out'));

create table if not exists customer_tags (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (shop_id, name)
);

create table if not exists customer_tag_links (
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  tag_id uuid not null references customer_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (shop_id, customer_id, tag_id)
);

create index if not exists customers_shop_consent_idx on customers (shop_id, consent_status, updated_at desc);
create index if not exists customer_tag_links_customer_idx on customer_tag_links (shop_id, customer_id);
