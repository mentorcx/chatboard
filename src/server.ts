import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { startReconcileJob } from './jobs/reconcileKommo';
import { pool } from './db/pool';

async function bootstrap() {
  const app = await buildApp();

  startReconcileJob();

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM recibido, cerrando servidor...');
    await app.close();
    await pool.end();
    process.exit(0);
  });

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT }, 'Servidor iniciado');
  } catch (error) {
    logger.error({ err: error }, 'No se pudo iniciar el servidor');
    process.exit(1);
  }
}

bootstrap();
