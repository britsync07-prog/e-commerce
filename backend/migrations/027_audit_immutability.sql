create or replace function prevent_audit_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events is append-only' using errcode = '55000';
end;
$$;

drop trigger if exists audit_events_immutable on audit_events;
create trigger audit_events_immutable
before update or delete on audit_events
for each row execute function prevent_audit_event_mutation();
