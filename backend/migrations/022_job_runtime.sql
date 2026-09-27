alter table outbox_jobs add column if not exists max_attempts integer not null default 5;
alter table outbox_jobs add column if not exists locked_at timestamptz;
alter table outbox_jobs add column if not exists locked_by text;
alter table outbox_jobs add column if not exists completed_at timestamptz;
alter table outbox_jobs add column if not exists dead_at timestamptz;
create index if not exists outbox_jobs_claim_idx on outbox_jobs (status, run_after, created_at) where status in ('pending', 'failed');
