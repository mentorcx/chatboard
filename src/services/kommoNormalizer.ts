import { KommoWebhookParsed } from './schemas';
import { sha256 } from '../utils/hash';
import { toISOStringOrNull } from '../utils/time';

export type NormalizedEvent = {
  eventType: string;
  eventId: string;
  eventAt: string;
  leadId: number | null;
  pipelineId: number | null;
  fromStageId: number | null;
  toStageId: number | null;
  ownerId: number | null;
  actorType: string | null;
  actorId: number | null;
  status: string | null;
  dueAt: string | null;
  completedAt: string | null;
  price: number | null;
  lostReasonId: number | null;
  tags: unknown[];
  source: string | null;
  campaign: string | null;
  channel: string | null;
  taskId: number | null;
  leadCreatedAt: string | null;
  leadUpdatedAt: string | null;
};

function detectEventType(body: Record<string, unknown>, parsed?: KommoWebhookParsed): string {
  if (typeof parsed?.event_type === 'string') {
    return parsed.event_type;
  }

  if (typeof body.type === 'string') {
    return body.type;
  }

  if ((body.task as Record<string, unknown> | undefined)?.completed_at) {
    return 'task.completed';
  }

  if (body.task) {
    return 'task.updated';
  }

  if ((body.lead as Record<string, unknown> | undefined)?.from_stage_id || (body.lead as Record<string, unknown> | undefined)?.to_stage_id) {
    return 'lead.stage_changed';
  }

  if ((body.lead as Record<string, unknown> | undefined)?.created_at) {
    return 'lead.created';
  }

  return 'lead.updated';
}

export function normalizeKommoEvent(body: Record<string, unknown>, parsed?: KommoWebhookParsed): NormalizedEvent {
  const lead = (body.lead as Record<string, unknown> | undefined) ?? {};
  const task = (body.task as Record<string, unknown> | undefined) ?? {};
  const actor = (body.actor as Record<string, unknown> | undefined) ?? {};

  const eventType = detectEventType(body, parsed);
  const eventAt =
    toISOStringOrNull(parsed?.event_time) ??
    toISOStringOrNull((body.event_time as string | number | undefined) ?? (task.updated_at as string | number | undefined) ?? (lead.updated_at as string | number | undefined)) ??
    new Date().toISOString();

  const leadId = Number(lead.id ?? task.lead_id) || null;
  const pipelineId = Number(lead.pipeline_id) || null;
  const toStageId = Number(lead.to_stage_id ?? lead.stage_id) || null;
  const fromStageId = Number(lead.from_stage_id) || null;
  const taskId = Number(task.id) || null;

  const stableInput = {
    eventType,
    leadId,
    eventAt,
    pipelineId,
    fromStageId,
    toStageId,
    taskId,
    status: String(lead.status ?? task.status ?? ''),
    dueAt: toISOStringOrNull(task.due_at),
    completedAt: toISOStringOrNull(task.completed_at)
  };

  const eventId = String(body.event_id ?? parsed?.event_id ?? sha256(JSON.stringify(stableInput)));

  return {
    eventType,
    eventId,
    eventAt,
    leadId,
    pipelineId,
    fromStageId,
    toStageId,
    ownerId: Number(lead.owner_id ?? task.owner_id) || null,
    actorType: (actor.type as string | undefined) ?? null,
    actorId: Number(actor.id) || null,
    status: (lead.status as string | undefined) ?? (task.status as string | undefined) ?? null,
    dueAt: toISOStringOrNull(task.due_at),
    completedAt: toISOStringOrNull(task.completed_at),
    price: lead.price !== undefined && lead.price !== null ? Number(lead.price) : null,
    lostReasonId: Number(lead.lost_reason_id) || null,
    tags: Array.isArray(lead.tags) ? lead.tags : [],
    source: (lead.source as string | undefined) ?? (lead.utm_source as string | undefined) ?? null,
    campaign: (lead.campaign as string | undefined) ?? (lead.utm_campaign as string | undefined) ?? null,
    channel: (lead.channel as string | undefined) ?? null,
    taskId,
    leadCreatedAt: toISOStringOrNull(lead.created_at),
    leadUpdatedAt: toISOStringOrNull(lead.updated_at)
  };
}
