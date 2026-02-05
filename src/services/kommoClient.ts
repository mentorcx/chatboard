import { env } from '../config/env';
import { logger } from '../config/logger';
import { sleep } from '../utils/time';

type KommoLeadResponse = {
  id: number;
  created_at?: string;
  updated_at?: string;
  pipeline_id?: number;
  status_id?: number;
  old_status_id?: number;
  responsible_user_id?: number;
  status?: string;
  loss_reason_id?: number;
  price?: number;
  tags?: unknown[];
  custom_fields_values?: Array<{ field_code?: string; values?: Array<{ value: string }> }>;
};

type KommoTaskResponse = {
  id: number;
  entity_id: number;
  responsible_user_id?: number;
  task_type_id?: number;
  created_at?: string;
  complete_till?: string;
  closed_at?: string;
  is_completed?: boolean;
};

const BASE_URL = `https://${env.KOMMO_SUBDOMAIN}.kommo.com`;
const DEFAULT_PAGE_SIZE = 100;

async function requestWithRetry(path: string, retries = 3): Promise<any> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: {
          Authorization: `Bearer ${env.KOMMO_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Kommo API status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      const wait = 500 * attempt;
      logger.warn({ err: error, path, attempt, wait }, 'Error consultando Kommo, reintentando');
      await sleep(wait);
    }
  }

  throw lastError;
}

/**
 * Endpoint placeholder: ajustar según endpoint final de Kommo para leads actualizados.
 */
export async function fetchLeadsUpdatedSince(hours = 48): Promise<KommoLeadResponse[]> {
  const updatedSince = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const all: KommoLeadResponse[] = [];

  for (let page = 1; page < 1000; page += 1) {
    const path = `/api/v4/leads?filter[updated_at][from]=${encodeURIComponent(updatedSince)}&limit=${DEFAULT_PAGE_SIZE}&page=${page}`;
    const data = await requestWithRetry(path);

    const batch = (data?._embedded?.leads ?? []) as KommoLeadResponse[];
    if (batch.length === 0) break;

    all.push(...batch);
    await sleep(150);
  }

  return all;
}

/**
 * Endpoint placeholder: ajustar según endpoint final de Kommo para tasks actualizadas.
 */
export async function fetchTasksUpdatedSince(hours = 48): Promise<KommoTaskResponse[]> {
  const updatedSince = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const all: KommoTaskResponse[] = [];

  for (let page = 1; page < 1000; page += 1) {
    const path = `/api/v4/tasks?filter[updated_at][from]=${encodeURIComponent(updatedSince)}&limit=${DEFAULT_PAGE_SIZE}&page=${page}`;
    const data = await requestWithRetry(path);

    const batch = (data?._embedded?.tasks ?? []) as KommoTaskResponse[];
    if (batch.length === 0) break;

    all.push(...batch);
    await sleep(150);
  }

  return all;
}

export function mapLeadFromKommo(raw: KommoLeadResponse) {
  const cfields = raw.custom_fields_values ?? [];
  const getField = (code: string) => cfields.find((f) => f.field_code === code)?.values?.[0]?.value ?? null;

  return {
    eventType: 'reconcile.lead',
    eventId: `lead-${raw.id}-${raw.updated_at ?? Date.now()}`,
    eventAt: new Date(raw.updated_at ?? Date.now()).toISOString(),
    leadId: raw.id,
    pipelineId: raw.pipeline_id ?? null,
    fromStageId: raw.old_status_id ?? null,
    toStageId: raw.status_id ?? null,
    ownerId: raw.responsible_user_id ?? null,
    actorType: 'system',
    actorId: null,
    status: raw.status ?? null,
    dueAt: null,
    completedAt: null,
    price: raw.price ?? null,
    lostReasonId: raw.loss_reason_id ?? null,
    tags: raw.tags ?? [],
    source: getField('UTM_SOURCE'),
    campaign: getField('UTM_CAMPAIGN'),
    channel: getField('CHANNEL'),
    taskId: null,
    leadCreatedAt: raw.created_at ? new Date(raw.created_at).toISOString() : null,
    leadUpdatedAt: raw.updated_at ? new Date(raw.updated_at).toISOString() : null
  };
}

export function mapTaskFromKommo(raw: KommoTaskResponse) {
  const completedAt = raw.closed_at ? new Date(raw.closed_at).toISOString() : null;

  return {
    eventType: raw.is_completed ? 'task.completed' : 'task.updated',
    eventId: `task-${raw.id}-${raw.closed_at ?? raw.complete_till ?? Date.now()}`,
    eventAt: new Date(raw.created_at ?? Date.now()).toISOString(),
    leadId: raw.entity_id,
    pipelineId: null,
    fromStageId: null,
    toStageId: null,
    ownerId: raw.responsible_user_id ?? null,
    actorType: 'system',
    actorId: null,
    status: raw.is_completed ? 'completed' : 'open',
    dueAt: raw.complete_till ? new Date(raw.complete_till).toISOString() : null,
    completedAt,
    price: null,
    lostReasonId: null,
    tags: [],
    source: null,
    campaign: null,
    channel: null,
    taskId: raw.id,
    leadCreatedAt: null,
    leadUpdatedAt: null
  };
}
