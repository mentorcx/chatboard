import cron from 'node-cron';
import { logger } from '../config/logger';
import { fetchLeadsUpdatedSince, fetchTasksUpdatedSince, mapLeadFromKommo, mapTaskFromKommo } from '../services/kommoClient';
import { processReconcileEvent } from '../services/persistence';
import { sha256 } from '../utils/hash';

async function runReconciliation() {
  logger.info('Iniciando reconciliación nocturna con Kommo');

  const leads = await fetchLeadsUpdatedSince(48);
  const tasks = await fetchTasksUpdatedSince(48);

  const normalizedLeads = leads.map(mapLeadFromKommo);
  const normalizedTasks = tasks.map(mapTaskFromKommo);

  const leadsEventId = sha256(`reconcile.leads:${new Date().toISOString().slice(0, 10)}:${normalizedLeads.length}`);
  const tasksEventId = sha256(`reconcile.tasks:${new Date().toISOString().slice(0, 10)}:${normalizedTasks.length}`);

  await processReconcileEvent({
    eventId: leadsEventId,
    eventType: 'reconcile.leads',
    payload: { count: normalizedLeads.length },
    leads: normalizedLeads
  });

  await processReconcileEvent({
    eventId: tasksEventId,
    eventType: 'reconcile.tasks',
    payload: { count: normalizedTasks.length },
    tasks: normalizedTasks
  });

  logger.info({ leads: normalizedLeads.length, tasks: normalizedTasks.length }, 'Reconciliación finalizada');
}

export function startReconcileJob(): void {
  cron.schedule(
    '0 2 * * *',
    async () => {
      try {
        await runReconciliation();
      } catch (error) {
        logger.error({ err: error }, 'Falló el job de reconciliación');
      }
    },
    {
      timezone: 'America/Argentina/Buenos_Aires'
    }
  );

  logger.info('Job de reconciliación registrado (02:00 America/Argentina/Buenos_Aires)');
}

export { runReconciliation };
