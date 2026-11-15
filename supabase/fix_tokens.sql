-- P3: office loop (admin → office email → /fix/<token> → supervisor confirms). Idempotent: safe to run again.

-- One-time office links. Only the sha256 of the token is stored; the raw token is only in the email.
create table if not exists fix_tokens (
  token_hash       text primary key,
  issue_id         uuid not null references issues(id) on delete cascade,
  office           text not null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,               -- 7 days after sending
  acknowledged_at  timestamptz,
  fix_submitted_at timestamptz
);
create index if not exists fix_tokens_issue on fix_tokens (issue_id, created_at desc);
alter table fix_tokens enable row level security;     -- no policies: server (service role) only

-- Demo department emails (never real USC addresses; delivery always goes to DEMO_OFFICE_INBOX).
update routing set team_email = 'accessibility@ripple-demo.test' where category = 'elevator_access';
update routing set team_email = 'its@ripple-demo.test'           where category = 'tech';
update routing set team_email = 'facilities@ripple-demo.test'
 where category in ('broken_equipment', 'grounds', 'cleanliness', 'safety_hazard', 'water_leak');
update routing set team_email = 'housing@ripple-demo.test'        where category = 'housing';
update routing set team_email = 'hospitality@ripple-demo.test'    where category = 'dining';
update routing set team_email = 'transportation@ripple-demo.test' where category = 'transportation';
update routing set team_email = 'usg@ripple-demo.test'            where team_email is null;
