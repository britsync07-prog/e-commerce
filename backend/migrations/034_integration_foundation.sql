alter table courier_accounts add column if not exists credential_ref text;
alter table courier_accounts add column if not exists last_error text;

alter table shipments add column if not exists provider_status text not null default 'not_required' check (provider_status in ('not_required', 'queued', 'booked', 'not_connected', 'failed'));
alter table shipments add column if not exists provider_error text;
alter table shipments add column if not exists job_id uuid references outbox_jobs(id) on delete set null;

create index if not exists shipments_provider_status_idx on shipments (shop_id, provider_status, created_at desc);
