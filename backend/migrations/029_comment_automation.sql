create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  platform text not null check (platform in ('facebook', 'instagram')),
  external_post_id text not null,
  media_url text,
  caption text,
  linked_product_id uuid references products(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, platform, external_post_id)
);

create table if not exists comment_automation_rules (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  post_id uuid references social_posts(id) on delete cascade,
  name text not null,
  keywords text[] not null default '{}',
  language text not null default 'bn-en',
  public_reply_template text,
  dm_template text,
  delay_seconds int not null default 60 check (delay_seconds between 0 and 86400),
  limit_per_hour int not null default 20 check (limit_per_hour between 1 and 200),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists comment_leads (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  post_id uuid references social_posts(id) on delete set null,
  rule_id uuid references comment_automation_rules(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  platform text not null check (platform in ('facebook', 'instagram')),
  external_comment_id text not null,
  commenter_external_id text not null,
  commenter_name text,
  comment_text text not null,
  intent text not null default 'unknown',
  sentiment text not null default 'neutral' check (sentiment in ('positive', 'neutral', 'negative', 'angry', 'spam')),
  product_interest_id uuid references products(id) on delete set null,
  public_reply_preview text,
  dm_preview text,
  dm_status text not null default 'not_sent' check (dm_status in ('not_sent', 'drafted', 'blocked', 'sent', 'failed')),
  order_status text not null default 'none' check (order_status in ('none', 'drafted', 'ordered')),
  status text not null default 'new' check (status in ('new', 'review', 'dm_drafted', 'ordered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, platform, external_comment_id)
);

create table if not exists comment_moderation_records (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  lead_id uuid not null references comment_leads(id) on delete cascade,
  sentiment text not null,
  hidden boolean not null default false,
  reason text,
  assigned_staff_id uuid references users(id) on delete set null,
  staff_action text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists comment_automation_actions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  rule_id uuid references comment_automation_rules(id) on delete set null,
  lead_id uuid references comment_leads(id) on delete cascade,
  action text not null check (action in ('public_reply', 'dm')),
  status text not null default 'drafted' check (status in ('drafted', 'sent', 'blocked', 'failed')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists social_posts_shop_status_idx on social_posts (shop_id, status);
create index if not exists comment_rules_shop_status_idx on comment_automation_rules (shop_id, status);
create index if not exists comment_leads_shop_status_idx on comment_leads (shop_id, status, created_at desc);
create index if not exists comment_moderation_shop_idx on comment_moderation_records (shop_id, created_at desc);
create index if not exists comment_actions_rule_window_idx on comment_automation_actions (shop_id, rule_id, created_at desc);
