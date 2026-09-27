alter table customers add column if not exists status text not null default 'active';
alter table customers add column if not exists merged_into_customer_id uuid references customers(id) on delete set null;
alter table customers drop constraint if exists customers_status_check;
alter table customers add constraint customers_status_check check (status in ('active', 'merged'));

create index if not exists customers_shop_status_idx on customers (shop_id, status, created_at desc);
