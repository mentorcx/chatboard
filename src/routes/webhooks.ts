import { FastifyInstance } from 'fastify';
import { kommoWebhookSchema } from '../services/schemas';
import { normalizeKommoEvent } from '../services/kommoNormalizer';
import { insertRawEvent, processNormalizedEvent } from '../services/persistence';
import { validateKommoSignature } from '../services/kommoAuth';

type KommoRequestBody = Record<string, unknown>;

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: KommoRequestBody }>('/webhooks/kommo', async (request, reply) => {
    const signature = request.headers['x-kommo-signature'] as string | undefined;
    const altSignature = request.headers['x-signature'] as string | undefined;
    const rawBody = request.rawBody ?? JSON.stringify(request.body ?? {});

    if (!validateKommoSignature(rawBody, signature ?? altSignature)) {
      request.log.warn('Firma inválida en webhook Kommo');
      return reply.status(401).send({ ok: false, error: 'invalid_signature' });
    }

    const parsed = kommoWebhookSchema.safeParse(request.body ?? {});
    const normalized = normalizeKommoEvent(request.body ?? {}, parsed.success ? parsed.data : undefined);

    const rawResult = await insertRawEvent({
      source: 'kommo',
      eventType: normalized.eventType,
      eventId: normalized.eventId,
      leadId: normalized.leadId,
      payload: {
        schema_valid: parsed.success,
        body: request.body
      }
    });

    if (!rawResult.inserted) {
      return reply.status(200).send({ ok: true, duplicated: true });
    }

    try {
      await processNormalizedEvent(normalized);
    } catch (error) {
      request.log.error({ err: error, eventId: normalized.eventId }, 'Error procesando webhook de Kommo');
      return reply.status(500).send({ ok: false, error: 'persist_failed', eventId: normalized.eventId });
    }

    return reply.status(200).send({ ok: true, eventId: normalized.eventId, schemaValid: parsed.success });
  });
}
