-- Migration 038: Product Vector Embeddings and AI Brain Settings
-- Supports multimodal visual search, strict multi-tenant catalog embeddings, and AI Brain controls.

create table if not exists product_image_embeddings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  asset_id uuid references asset_objects(id) on delete set null,
  image_url text not null,
  embedding_model text not null default 'gemini-embedding-2',
  embedding float8[] not null,
  dimensions int not null default 768,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_product_image_embeddings unique (shop_id, product_id, image_url)
);

create index if not exists product_image_embeddings_shop_idx
  on product_image_embeddings (shop_id, product_id);

create or replace function cosine_similarity(a float8[], b float8[])
returns float8
language sql immutable strict parallel safe as $$
  select (
    sum(a_val * b_val) /
    nullif(sqrt(sum(a_val * a_val)) * sqrt(sum(b_val * b_val)), 0)
  )
  from unnest(a) with ordinality as u1(a_val, i)
  join unnest(b) with ordinality as u2(b_val, j) on u1.i = u2.j;
$$;

alter table shops
  add column if not exists ai_brain jsonb not null default '{
    "enabled": true,
    "shopName": "",
    "tone": "friendly",
    "language": "auto",
    "systemPrompt": "You are a helpful sales assistant for our shop. Always answer politely. State prices and stock availability accurately based on the matched product. Do not negotiate on price or make false promises.",
    "confidenceThreshold": 0.70,
    "fallbackMessage": "ধন্যবাদ আপনার বার্তার জন্য! আমাদের একজন প্রতিনিধি শীঘ্রই আপনার সাথে যোগাযোগ করবেন।"
  }'::jsonb;

alter table conversations
  add column if not exists ai_enabled boolean not null default true;
