alter table comment_automation_actions add column if not exists provider text not null default 'meta';
alter table comment_automation_actions add column if not exists provider_status text not null default 'queued' check (provider_status in ('queued', 'not_connected', 'sent', 'failed'));
alter table comment_automation_actions add column if not exists job_id uuid references outbox_jobs(id) on delete set null;
alter table comment_automation_actions add column if not exists attempts int not null default 0;
alter table comment_automation_actions add column if not exists max_attempts int not null default 3;
alter table comment_automation_actions add column if not exists last_attempt_at timestamptz;
alter table comment_automation_actions add column if not exists updated_at timestamptz not null default now();

create index if not exists comment_actions_provider_status_idx on comment_automation_actions (shop_id, provider_status, created_at desc);
