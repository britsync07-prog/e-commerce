create table if not exists action_approvals (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  action_type text not null check (action_type in ('job.retry')),
  target_type text not null,
  target_id text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'executed', 'failed')),
  reason text not null,
  preview jsonb not null default '{}'::jsonb,
  result jsonb,
  requested_by uuid references users(id),
  decided_by uuid references users(id),
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists action_approvals_shop_status_idx on action_approvals (shop_id, status, created_at desc);
create index if not exists action_approvals_target_idx on action_approvals (shop_id, target_type, target_id, created_at desc);
