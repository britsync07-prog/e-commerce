create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  source text not null default 'database_trigger',
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_shop_time_idx on analytics_events (shop_id, occurred_at desc);
create index if not exists analytics_events_shop_type_idx on analytics_events (shop_id, event_type, occurred_at desc);

create or replace function emit_analytics_event() returns trigger language plpgsql as $$
declare
  event_name text := replace(TG_TABLE_NAME, '_', '.') || case when TG_OP = 'UPDATE' then '.updated' when TG_OP = 'INSERT' then '.created' else '.deleted' end;
begin
  if TG_OP = 'DELETE' then
    insert into analytics_events (shop_id, event_type, entity_type, entity_id, payload) values (OLD.shop_id, event_name, TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    return OLD;
  end if;
  insert into analytics_events (shop_id, event_type, entity_type, entity_id, payload) values (NEW.shop_id, event_name, TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
  return NEW;
end;
$$;

drop trigger if exists orders_analytics_event on orders;
create trigger orders_analytics_event after insert or update or delete on orders for each row execute function emit_analytics_event();
drop trigger if exists shipments_analytics_event on shipments;
create trigger shipments_analytics_event after insert or update or delete on shipments for each row execute function emit_analytics_event();
drop trigger if exists payments_analytics_event on payment_records;
create trigger payments_analytics_event after insert or update or delete on payment_records for each row execute function emit_analytics_event();
drop trigger if exists inbox_analytics_event on conversation_messages;
create trigger inbox_analytics_event after insert or update or delete on conversation_messages for each row execute function emit_analytics_event();
drop trigger if exists ai_drafts_analytics_event on ai_reply_drafts;
create trigger ai_drafts_analytics_event after insert or update or delete on ai_reply_drafts for each row execute function emit_analytics_event();
