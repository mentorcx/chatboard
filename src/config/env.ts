import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerido'),
  KOMMO_SUBDOMAIN: z.string().min(1, 'KOMMO_SUBDOMAIN es requerido'),
  KOMMO_ACCESS_TOKEN: z.string().min(1, 'KOMMO_ACCESS_TOKEN es requerido'),
  KOMMO_WEBHOOK_SECRET: z.string().default(''),
  LOG_LEVEL: z.string().default('info'),
  TZ: z.string().default('America/Argentina/Buenos_Aires')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
