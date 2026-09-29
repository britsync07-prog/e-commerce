alter table shops add column if not exists domain_status text not null default 'pending' check (domain_status in ('pending', 'ready', 'failed'));
alter table shops add column if not exists domain_last_checked_at timestamptz;
alter table shops add column if not exists domain_error text;
alter table shops add column if not exists publish_version int not null default 0;
alter table shops add column if not exists published_storefront_config jsonb;
alter table shops add column if not exists published_at timestamptz;

create index if not exists shops_domain_status_idx on shops (domain_status, updated_at desc);
