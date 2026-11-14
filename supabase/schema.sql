-- From README §6. Run once in Supabase → SQL Editor.
create extension if not exists pgcrypto;

create table locations (
  id text primary key,                 -- e.g. 'leavey'
  name text not null,
  lat double precision not null,
  lng double precision not null,
  floors text[] not null default '{}'
);

create table routing (
  category text primary key,
  team_name text not null,
  team_email text
);

create table issues (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references locations(id),
  floor text,
  category text not null references routing(category),
  title text not null,
  description text,
  priority text not null default 'medium'
    check (priority in ('low','medium','high','urgent')),
  status text not null default 'open'
    check (status in ('open','assigned','resolved')),
  assigned_team text,
  reporter_count int not null default 0,
  before_photo_path text,
  after_photo_path text,
  resolution_note text,
  ai_fix_verdict jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  reporter_id uuid not null,           -- Supabase anonymous user id
  photo_path text not null,
  note text,
  ai_suggestion jsonb,
  ai_used boolean not null default true,
  created_at timestamptz not null default now(),
  unique (issue_id, reporter_id)       -- one confirmation per device per issue
);

create or replace function refresh_reporter_count() returns trigger
language plpgsql as $$
begin
  update issues
     set reporter_count = (select count(distinct reporter_id) from reports where issue_id = new.issue_id),
         updated_at = now()
   where id = new.issue_id;
  return new;
end $$;

create trigger reports_count
after insert on reports
for each row execute function refresh_reporter_count();

-- RLS: clients may read; all writes go through the server (service role bypasses RLS)
alter table locations enable row level security;
alter table routing   enable row level security;
alter table issues    enable row level security;
alter table reports   enable row level security;

create policy "read locations" on locations for select using (true);
create policy "read routing"   on routing   for select using (true);
create policy "read issues"    on issues    for select using (true);
create policy "read reports"   on reports   for select using (true);

alter publication supabase_realtime add table issues;

-- Photo buckets (public read; uploads only via the server's service role)
insert into storage.buckets (id, name, public) values
  ('report-photos', 'report-photos', true),
  ('resolution-photos', 'resolution-photos', true)
on conflict (id) do nothing;
