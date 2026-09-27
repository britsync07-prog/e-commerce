create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  channel text not null check (channel in ('messenger', 'instagram', 'manual')),
  buyer_external_id text not null,
  buyer_name text,
  buyer_phone text,
  intent text,
  assigned_staff_id uuid references users(id),
  ai_paused boolean not null default false,
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, channel, buyer_external_id)
);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  source text not null check (source in ('buyer', 'staff', 'ai')),
  external_message_id text,
  body text not null,
  intent text,
  sentiment text,
  metadata jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists ai_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid references conversation_messages(id) on delete set null,
  status text not null default 'suggested' check (status in ('suggested', 'approved', 'rejected', 'needs_review')),
  body text not null,
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  source_refs jsonb not null default '[]'::jsonb,
  escalation_reason text,
  created_by text not null default 'suggest-only',
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_shop_status_idx on conversations (shop_id, status, last_message_at desc);
create index if not exists conversation_messages_conversation_idx on conversation_messages (conversation_id, created_at asc);
create index if not exists ai_reply_drafts_conversation_idx on ai_reply_drafts (conversation_id, created_at desc);
