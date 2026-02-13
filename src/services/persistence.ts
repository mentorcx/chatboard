import { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { NormalizedEvent } from './kommoNormalizer';

export async function insertRawEvent(params: {
  source: string;
  eventType: string;
  eventId: string;
  leadId: number | null;
  payload: unknown;
}) {
  const query = `
    INSERT INTO raw_events (source, event_type, event_id, lead_id, payload, received_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
    ON CONFLICT (source, event_id) DO NOTHING
    RETURNING id;
  `;

  const result = await pool.query(query, [
    params.source,
    params.eventType,
    params.eventId,
    params.leadId,
    JSON.stringify(params.payload)
  ]);

  return { inserted: (result.rowCount ?? 0) > 0 };
}

export async function processNormalizedEvent(event: NormalizedEvent): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (event.leadId) {
      await upsertLead(client, event);
    }

    if (event.eventType === 'lead.stage_changed' && event.leadId && event.toStageId) {
      await insertStageEvent(client, event);
    }

    if (event.taskId) {
      await upsertTask(client, event);
    }

    await markRawProcessed(client, 'kommo', event.eventId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    await markRawError('kommo', event.eventId, error);
    throw error;
  } finally {
    client.release();
  }
}

export async function processReconcileEvent(params: {
  eventId: string;
  eventType: string;
  payload: unknown;
  leads?: NormalizedEvent[];
  tasks?: NormalizedEvent[];
}): Promise<void> {
  const raw = await insertRawEvent({
    source: 'reconcile',
    eventType: params.eventType,
    eventId: params.eventId,
    leadId: null,
    payload: params.payload
  });

  if (!raw.inserted) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const lead of params.leads ?? []) {
      await upsertLead(client, lead);
      if (lead.toStageId) {
        await insertStageEvent(client, lead);
      }
    }

    for (const task of params.tasks ?? []) {
      await upsertTask(client, task);
    }

    await markRawProcessed(client, 'reconcile', params.eventId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    await markRawError('reconcile', params.eventId, error);
    throw error;
  } finally {
    client.release();
  }
}

async function upsertLead(client: PoolClient, event: NormalizedEvent): Promise<void> {
  if (!event.leadId) return;

  const query = `
    INSERT INTO leads (
      lead_id, created_at, updated_at, pipeline_id, stage_id, status, owner_id,
      source, campaign, channel, lost_reason_id, price, tags
    ) VALUES (
      $1, COALESCE($2, NOW()), COALESCE($3, NOW()), $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13::jsonb
    )
    ON CONFLICT (lead_id) DO UPDATE SET
      updated_at = GREATEST(leads.updated_at, EXCLUDED.updated_at),
      pipeline_id = COALESCE(EXCLUDED.pipeline_id, leads.pipeline_id),
      stage_id = COALESCE(EXCLUDED.stage_id, leads.stage_id),
      status = COALESCE(EXCLUDED.status, leads.status),
      owner_id = COALESCE(EXCLUDED.owner_id, leads.owner_id),
      source = COALESCE(EXCLUDED.source, leads.source),
      campaign = COALESCE(EXCLUDED.campaign, leads.campaign),
      channel = COALESCE(EXCLUDED.channel, leads.channel),
      lost_reason_id = COALESCE(EXCLUDED.lost_reason_id, leads.lost_reason_id),
      price = COALESCE(EXCLUDED.price, leads.price),
      tags = CASE
        WHEN EXCLUDED.tags IS NOT NULL AND EXCLUDED.tags <> '[]'::jsonb THEN EXCLUDED.tags
        ELSE leads.tags
      END;
  `;

  await client.query(query, [
    event.leadId,
    event.leadCreatedAt,
    event.leadUpdatedAt ?? event.eventAt,
    event.pipelineId,
    event.toStageId,
    event.status,
    event.ownerId,
    event.source,
    event.campaign,
    event.channel,
    event.lostReasonId,
    event.price,
    JSON.stringify(event.tags)
  ]);
}

async function insertStageEvent(client: PoolClient, event: NormalizedEvent): Promise<void> {
  if (!event.leadId || !event.toStageId) return;

  const query = `
    INSERT INTO lead_stage_events (
      lead_id, pipeline_id, from_stage_id, to_stage_id, event_at, actor_type, actor_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (lead_id, to_stage_id, event_at) DO NOTHING;
  `;

  await client.query(query, [
    event.leadId,
    event.pipelineId,
    event.fromStageId,
    event.toStageId,
    event.eventAt,
    event.actorType,
    event.actorId
  ]);
}

async function upsertTask(client: PoolClient, event: NormalizedEvent): Promise<void> {
  if (!event.taskId || !event.leadId) return;

  const query = `
    INSERT INTO tasks (
      task_id, lead_id, owner_id, task_type, created_at, due_at, completed_at, status
    ) VALUES (
      $1, $2, $3, COALESCE($4, 'generic'), COALESCE($5, NOW()), $6, $7, COALESCE($8, 'open')
    )
    ON CONFLICT (task_id) DO UPDATE SET
      lead_id = EXCLUDED.lead_id,
      owner_id = COALESCE(EXCLUDED.owner_id, tasks.owner_id),
      task_type = COALESCE(EXCLUDED.task_type, tasks.task_type),
      due_at = COALESCE(EXCLUDED.due_at, tasks.due_at),
      completed_at = COALESCE(EXCLUDED.completed_at, tasks.completed_at),
      status = COALESCE(EXCLUDED.status, tasks.status);
  `;

  await client.query(query, [
    event.taskId,
    event.leadId,
    event.ownerId,
    event.taskType,
    event.eventAt,
    event.dueAt,
    event.completedAt,
    event.status
  ]);
}

async function markRawProcessed(client: PoolClient, source: string, eventId: string): Promise<void> {
  await client.query(
    `UPDATE raw_events SET processed_at = NOW(), error = NULL WHERE source = $1 AND event_id = $2`,
    [source, eventId]
  );
}

async function markRawError(source: string, eventId: string, error: unknown): Promise<void> {
  await pool.query(
    `UPDATE raw_events SET error = $3, processed_at = NULL WHERE source = $1 AND event_id = $2`,
    [source, eventId, error instanceof Error ? error.message : String(error)]
  );
}
