create table if not exists ai_commands (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  requested_by uuid not null references users(id),
  prompt text not null,
  action_type text not null check (action_type in ('question', 'draft', 'action')),
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
  required_permission text not null,
  status text not null default 'drafted' check (status in ('drafted', 'awaiting_approval', 'approved', 'rejected', 'executed', 'failed')),
  preview jsonb not null default '{}'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  approval_reason text,
  approved_by uuid references users(id),
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_commands_shop_created_idx on ai_commands (shop_id, created_at desc);
create index if not exists ai_commands_pending_idx on ai_commands (shop_id, status, created_at desc);
