-- Help SC: Ask, Favors, Lost & Found. Safe to run more than once (idempotent).
-- Reads: public (RLS select). Writes: only through /api/help/* with the service role.

create extension if not exists pgcrypto;

create table if not exists help_posts (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('ask', 'favor', 'lost', 'found')),
  author_id         uuid not null,                       -- Supabase anonymous user id
  title             text not null check (char_length(title) between 3 and 120),
  body              text check (body is null or char_length(body) <= 600),
  photo_path        text,                                -- help-photos/<post id>.jpg (faces blurred on device)
  location_id       text not null,                       -- building id (osm-…/leavey) or spot-…
  location_name     text not null,
  lat               double precision not null,
  lng               double precision not null,
  floor             text,
  status            text not null default 'open' check (status in ('open', 'resolved', 'closed')),
  resolved_reply_id uuid,                                -- the answer / offer that helped
  helper_id         uuid,                                -- author of that reply (karma)
  reply_count       int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  expires_at        timestamptz not null                 -- ask 3 h, favor 24 h, lost/found 14 d
);
create index if not exists help_posts_live on help_posts (expires_at desc, created_at desc);
create index if not exists help_posts_author on help_posts (author_id, created_at desc);

create table if not exists help_replies (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references help_posts(id) on delete cascade,
  author_id   uuid not null,
  body        text check (body is null or char_length(body) <= 400),
  photo_path  text,                                      -- help-photos/<post id>/<reply id>.jpg
  created_at  timestamptz not null default now(),
  check (body is not null or photo_path is not null)
);
create index if not exists help_replies_post on help_replies (post_id, created_at);
create index if not exists help_replies_author on help_replies (author_id, created_at desc);

create or replace function help_refresh_reply_count() returns trigger
language plpgsql as $$
begin
  update help_posts
     set reply_count = (select count(*) from help_replies where post_id = new.post_id),
         updated_at  = now()
   where id = new.post_id;
  return new;
end $$;

drop trigger if exists help_replies_count on help_replies;
create trigger help_replies_count after insert on help_replies
for each row execute function help_refresh_reply_count();

alter table help_posts   enable row level security;
alter table help_replies enable row level security;
drop policy if exists "read help posts"   on help_posts;
drop policy if exists "read help replies" on help_replies;
create policy "read help posts"   on help_posts   for select using (true);
create policy "read help replies" on help_replies for select using (true);

-- Realtime: new posts / replies / status changes appear live
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'help_posts') then
    alter publication supabase_realtime add table help_posts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'help_replies') then
    alter publication supabase_realtime add table help_replies;
  end if;
end $$;

-- Public photo bucket (uploads only via the server)
insert into storage.buckets (id, name, public) values ('help-photos', 'help-photos', true)
on conflict (id) do nothing;
