import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { logger } from './config/logger';
import { registerWebhookRoutes } from './routes/webhooks';

export async function buildApp() {
  const app = Fastify({ logger });

  await app.register(helmet);

  app.get('/health', async () => ({ ok: true }));

  await registerWebhookRoutes(app);

  return app;
}
