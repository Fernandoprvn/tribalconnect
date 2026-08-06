import { createHash, randomUUID } from 'node:crypto';
import { env } from '../config/env';

export const normalizeMobile = (mobile: string) => mobile.replace(/\D/g, '').slice(-10);

export const normalizeAadhaar = (aadhaar: string) => aadhaar.replace(/\D/g, '');

export const hashAadhaar = (aadhaar: string) =>
  createHash('sha256').update(`${env.AADHAAR_HASH_SALT}:${normalizeAadhaar(aadhaar)}`).digest('hex');

export const maskAadhaar = (aadhaar: string) => {
  const normalized = normalizeAadhaar(aadhaar);
  return `XXXX XXXX ${normalized.slice(-4)}`;
};

export const maskMobile = (mobile: string) => {
  const normalized = normalizeMobile(mobile);
  return `${'*'.repeat(6)}${normalized.slice(-4)}`;
};

export const identifier = (prefix: string) => `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
