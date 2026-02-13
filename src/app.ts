import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { logger } from './config/logger';
import { registerWebhookRoutes } from './routes/webhooks';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export async function buildApp() {
  const app = Fastify({ logger });

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      const raw = body as string;
      const json = JSON.parse(raw);
      (req as unknown as { rawBody: string }).rawBody = raw;
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  await app.register(helmet);

  app.get('/health', async () => ({ ok: true }));

  await registerWebhookRoutes(app);

  return app;
}
