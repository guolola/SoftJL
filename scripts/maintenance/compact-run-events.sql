-- Responsibility: one-time PostgreSQL maintenance for compacting historical run event payloads.
-- Review the target database and take a backup before executing this script.

begin;

update run_events
set payload = jsonb_build_object('type', 'completed', 'snapshotRef', run_id)
where event_type = 'completed'
  and payload ? 'snapshot';

with latest_terminal_events as (
  select distinct on (run_id)
    run_id,
    event_type
  from run_events
  where event_type in ('completed', 'failed', 'cancelled')
  order by run_id, sequence desc
)
update run_records records
set
  status = latest.event_type,
  completed_at = coalesce(records.completed_at, records.updated_at, now()),
  updated_at = now()
from latest_terminal_events latest
where records.id = latest.run_id
  and records.status in ('queued', 'running');

commit;
