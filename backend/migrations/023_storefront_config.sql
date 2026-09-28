alter table shops
  add column if not exists storefront_config jsonb not null default '{"theme":{"accent":"#111827","background":"#ffffff","text":"#111827"},"sections":["hero","products"],"seo":{}}'::jsonb;
