create table if not exists failed_deliveries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  shipment_id uuid not null references shipments(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  reason text not null,
  contact_result text,
  reschedule_date date,
  status text not null default 'open' check (status in ('open', 'rescheduled', 'returned')),
  created_by uuid references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists failed_deliveries_shop_status_idx on failed_deliveries (shop_id, status, created_at desc);
create index if not exists failed_deliveries_shipment_idx on failed_deliveries (shop_id, shipment_id, created_at desc);
