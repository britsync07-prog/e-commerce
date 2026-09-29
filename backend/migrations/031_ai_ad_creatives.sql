do $$
begin
  if to_regclass('public.ai_brand_rules') is null and exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'ai_brand_rules') then
    drop type public.ai_brand_rules cascade;
  end if;
  if to_regclass('public.ai_creative_templates') is null and exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'ai_creative_templates') then
    drop type public.ai_creative_templates cascade;
  end if;
  if to_regclass('public.ai_ad_creative_requests') is null and exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'ai_ad_creative_requests') then
    drop type public.ai_ad_creative_requests cascade;
  end if;
  if to_regclass('public.ai_ad_creative_outputs') is null and exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'ai_ad_creative_outputs') then
    drop type public.ai_ad_creative_outputs cascade;
  end if;
end $$;

create table if not exists ai_brand_rules (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  rules jsonb not null default '{}'::jsonb,
  banned_claims text[] not null default '{}'::text[],
  default_language text not null default 'bn-en',
  default_tone text not null default 'friendly',
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id)
);

create table if not exists ai_creative_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  format text not null check (format in ('hook', 'caption', 'headline', 'script', 'brief')),
  template jsonb not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, name)
);

create table if not exists ai_ad_creative_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  template_id uuid references ai_creative_templates(id) on delete set null,
  objective text not null,
  offer text,
  audience text not null,
  language text not null,
  tone text not null,
  format text not null check (format in ('meta_feed', 'meta_reel', 'story', 'short_video')),
  inputs jsonb not null default '{}'::jsonb,
  safety_result jsonb not null default '[]'::jsonb,
  status text not null default 'awaiting_review' check (status in ('awaiting_review', 'blocked', 'archived')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_ad_creative_outputs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  request_id uuid not null references ai_ad_creative_requests(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  format text not null check (format in ('hook', 'caption', 'headline', 'script', 'brief')),
  content text not null,
  safety_result jsonb not null default '[]'::jsonb,
  status text not null default 'review_only' check (status in ('review_only', 'blocked', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists ai_creative_templates_shop_idx on ai_creative_templates (shop_id, status, created_at desc);
create index if not exists ai_ad_creative_requests_shop_idx on ai_ad_creative_requests (shop_id, created_at desc);
create index if not exists ai_ad_creative_requests_product_idx on ai_ad_creative_requests (shop_id, product_id, created_at desc);
create index if not exists ai_ad_creative_outputs_product_idx on ai_ad_creative_outputs (shop_id, product_id, created_at desc);
create index if not exists ai_ad_creative_outputs_request_idx on ai_ad_creative_outputs (shop_id, request_id);
