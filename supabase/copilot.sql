-- P3: Dispatch Copilot columns. Idempotent: safe to run again. Run BEFORE supabase/demo_history.sql.

alter table issues add column if not exists is_demo       boolean not null default false; -- seeded demo history
alter table issues add column if not exists ai_risk       jsonb;   -- { safety_risk, notify_dps, act_today, reason, confidence }
alter table issues add column if not exists ai_confidence real;    -- AI category confidence at triage (0..1)
alter table issues add column if not exists ai_insight    jsonb;   -- cached recurrence insight { recurring, likely_cause, recommendation, confidence, count, resolved, computed_at }

-- issue_events.type: if a CHECK constraint exists, recreate it with 'acknowledged' and 'reminder' added
-- (keeps every value used so far). If there is no constraint, add one with the full list.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.issue_events'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table issue_events drop constraint %I', c);
  end loop;
  alter table issue_events add constraint issue_events_type_check check (type in (
    'created', 'confirmed', 'assigned', 'status', 'priority', 'rerouted', 'note', 'after_photo', 'verified',
    'resolved', 'reopened', 'rejected', 'merged', 'work_order', 'acknowledged', 'reminder'
  ));
end $$;
