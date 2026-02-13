import { createHash, timingSafeEqual } from 'crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function safeCompareHex(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, 'hex');
    const bBuf = Buffer.from(b, 'hex');

    if (aBuf.length !== bBuf.length) {
      return false;
    }

    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}
