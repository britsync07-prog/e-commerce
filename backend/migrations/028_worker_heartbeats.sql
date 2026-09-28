create table if not exists worker_heartbeats (
  worker_id text primary key,
  pid integer not null,
  status text not null check (status in ('running', 'stopping')),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worker_heartbeats_last_seen_idx on worker_heartbeats (last_seen_at desc);
