import { createHmac } from 'crypto';
import { env } from '../config/env';
import { safeCompareHex } from '../utils/hash';

/**
 * Placeholder de validación HMAC.
 * Ajustar el algoritmo/header según la documentación final de Kommo.
 */
export function validateKommoSignature(rawBody: string, signatureHeader?: string): boolean {
  if (!env.KOMMO_WEBHOOK_SECRET) {
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  const calculated = createHmac('sha256', env.KOMMO_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const incoming = signatureHeader.replace(/^sha256=/i, '').trim();

  return safeCompareHex(calculated, incoming);
}
