-- =====================================================
-- Views analíticas para Metabase
-- =====================================================

CREATE OR REPLACE VIEW vw_lead_funnel_times AS
WITH stage_events AS (
  SELECT
    lse.lead_id,
    lse.event_at,
    sm.semantic_stage
  FROM lead_stage_events lse
  JOIN stage_mapping sm ON sm.stage_id = lse.to_stage_id
),
first_stage_touch AS (
  SELECT
    lead_id,
    MIN(event_at) FILTER (WHERE semantic_stage = 'QUALIFIED') AS qualified_at,
    MIN(event_at) FILTER (WHERE semantic_stage = 'APPOINTMENT_SET') AS appointment_at,
    MIN(event_at) FILTER (WHERE semantic_stage = 'WON') AS won_at,
    MIN(event_at) FILTER (WHERE semantic_stage = 'LOST') AS lost_at
  FROM stage_events
  GROUP BY lead_id
)
SELECT
  l.lead_id,
  l.created_at,
  fst.qualified_at,
  fst.appointment_at,
  fst.won_at,
  fst.lost_at,
  EXTRACT(EPOCH FROM (fst.qualified_at - l.created_at)) / 3600.0 AS time_to_qualify_hours,
  EXTRACT(EPOCH FROM (fst.appointment_at - l.created_at)) / 3600.0 AS time_to_appointment_hours,
  EXTRACT(EPOCH FROM (COALESCE(fst.won_at, fst.lost_at) - l.created_at)) / 3600.0 AS time_to_close_hours,
  l.status,
  l.owner_id,
  l.source,
  l.campaign,
  l.channel,
  l.pipeline_id
FROM leads l
LEFT JOIN first_stage_touch fst ON fst.lead_id = l.lead_id;

CREATE OR REPLACE VIEW vw_tasks_health AS
SELECT
  t.task_id,
  t.lead_id,
  t.owner_id,
  t.due_at,
  t.status,
  (t.completed_at IS NULL AND t.due_at < now()) AS is_overdue,
  CASE
    WHEN t.completed_at IS NULL AND t.due_at < now()
      THEN EXTRACT(EPOCH FROM (now() - t.due_at)) / 3600.0
    ELSE 0
  END AS overdue_hours
FROM tasks t;

CREATE OR REPLACE VIEW vw_owner_weekly_performance AS
WITH weeks AS (
  SELECT
    date_trunc('week', l.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS week_start,
    l.owner_id,
    l.lead_id
  FROM leads l
),
funnel AS (
  SELECT
    v.lead_id,
    v.owner_id,
    v.time_to_qualify_hours,
    v.time_to_appointment_hours,
    CASE WHEN v.qualified_at IS NOT NULL THEN 1 ELSE 0 END AS qualified,
    CASE WHEN v.appointment_at IS NOT NULL THEN 1 ELSE 0 END AS appointments,
    CASE WHEN v.won_at IS NOT NULL THEN 1 ELSE 0 END AS won,
    CASE WHEN v.lost_at IS NOT NULL THEN 1 ELSE 0 END AS lost
  FROM vw_lead_funnel_times v
)
SELECT
  w.week_start,
  w.owner_id,
  COUNT(*) AS leads_in,
  COALESCE(SUM(f.qualified), 0) AS qualified,
  COALESCE(SUM(f.appointments), 0) AS appointments,
  COALESCE(SUM(f.won), 0) AS won,
  COALESCE(SUM(f.lost), 0) AS lost,
  CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(f.won), 0)::numeric / COUNT(*)::numeric ELSE 0 END AS win_rate,
  AVG(f.time_to_qualify_hours) AS avg_time_to_qualify_hours,
  AVG(f.time_to_appointment_hours) AS avg_time_to_appointment_hours
FROM weeks w
LEFT JOIN funnel f ON f.lead_id = w.lead_id
GROUP BY w.week_start, w.owner_id;
