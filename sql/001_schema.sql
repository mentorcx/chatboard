-- =====================================================
-- Supabase / Postgres schema para Dashboard KPIs Conversacionales
-- Timezone operativa: America/Argentina/Buenos_Aires
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabla de auditoría cruda de eventos recibidos (webhooks + reconciliación)
CREATE TABLE IF NOT EXISTS raw_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  event_type text NOT NULL,
  event_id text NOT NULL,
  lead_id bigint NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  error text NULL,
  CONSTRAINT uq_raw_events_source_event UNIQUE (source, event_id)
);

-- Dimensiones base
CREATE TABLE IF NOT EXISTS users (
  user_id bigint PRIMARY KEY,
  name text NOT NULL,
  team text NULL
);

CREATE TABLE IF NOT EXISTS pipelines (
  pipeline_id bigint PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS lost_reasons (
  lost_reason_id bigint PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS stages (
  stage_id bigint PRIMARY KEY,
  pipeline_id bigint NOT NULL REFERENCES pipelines(pipeline_id),
  name text NOT NULL,
  stage_order int NOT NULL
);

-- Snapshot actual por lead
CREATE TABLE IF NOT EXISTS leads (
  lead_id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  pipeline_id bigint NOT NULL REFERENCES pipelines(pipeline_id),
  stage_id bigint NOT NULL REFERENCES stages(stage_id),
  status text NOT NULL,
  owner_id bigint NOT NULL REFERENCES users(user_id),
  source text NOT NULL DEFAULT 'unknown',
  campaign text NOT NULL DEFAULT 'unknown',
  channel text NOT NULL DEFAULT 'unknown',
  lost_reason_id bigint NULL REFERENCES lost_reasons(lost_reason_id),
  price numeric NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- Eventos de transición de etapas (hecho principal del funnel)
CREATE TABLE IF NOT EXISTS lead_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id bigint NOT NULL REFERENCES leads(lead_id),
  pipeline_id bigint NOT NULL,
  from_stage_id bigint NULL,
  to_stage_id bigint NOT NULL,
  event_at timestamptz NOT NULL,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id bigint NULL,
  CONSTRAINT uq_lead_stage_events UNIQUE (lead_id, to_stage_id, event_at)
);

-- Tareas asociadas al lead
CREATE TABLE IF NOT EXISTS tasks (
  task_id bigint PRIMARY KEY,
  lead_id bigint NOT NULL REFERENCES leads(lead_id),
  owner_id bigint NOT NULL REFERENCES users(user_id),
  task_type text NOT NULL,
  created_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  status text NOT NULL
);

-- Mapeo a etapas semánticas para analítica transversal
CREATE TABLE IF NOT EXISTS stage_mapping (
  stage_id bigint PRIMARY KEY REFERENCES stages(stage_id),
  semantic_stage text NOT NULL CHECK (semantic_stage IN ('NEW', 'QUALIFIED', 'APPOINTMENT_SET', 'WON', 'LOST'))
);

-- Índices operativos y analíticos recomendados
CREATE INDEX IF NOT EXISTS idx_raw_events_received_at ON raw_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_events_lead_id ON raw_events (lead_id);
CREATE INDEX IF NOT EXISTS idx_raw_events_error_null ON raw_events (processed_at, error);

CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_owner_pipeline ON leads (owner_id, pipeline_id);
CREATE INDEX IF NOT EXISTS idx_leads_source_campaign_channel ON leads (source, campaign, channel);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);

CREATE INDEX IF NOT EXISTS idx_stage_events_lead_time ON lead_stage_events (lead_id, event_at);
CREATE INDEX IF NOT EXISTS idx_stage_events_to_stage_time ON lead_stage_events (to_stage_id, event_at);
CREATE INDEX IF NOT EXISTS idx_stage_events_pipeline_time ON lead_stage_events (pipeline_id, event_at);

CREATE INDEX IF NOT EXISTS idx_tasks_due_status ON tasks (due_at, status);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_due ON tasks (owner_id, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks (completed_at);
