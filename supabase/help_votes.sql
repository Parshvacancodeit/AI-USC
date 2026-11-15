-- Ask / Favors upvotes (Reddit-style). Safe to run more than once.
-- Run in Supabase → SQL Editor. Writes only through /api/help/vote (service role).

alter table help_posts add column if not exists score int not null default 0;

create table if not exists help_votes (
  post_id    uuid not null references help_posts(id) on delete cascade,
  user_id    uuid not null,                 -- Supabase anonymous user id
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create or replace function help_refresh_score() returns trigger
language plpgsql as $$
declare pid uuid := coalesce(new.post_id, old.post_id);
begin
  update help_posts set score = coalesce((select sum(value) from help_votes where post_id = pid), 0) where id = pid;
  return null;
end $$;

drop trigger if exists help_votes_score on help_votes;
create trigger help_votes_score after insert or update or delete on help_votes
for each row execute function help_refresh_score();

alter table help_votes enable row level security;
drop policy if exists "read help votes" on help_votes;
create policy "read help votes" on help_votes for select using (true);
