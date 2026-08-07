import type { AuthenticatedUser } from '../services/session.service';
import { maskMobile } from './identifiers';

export const serializeUser = (user: AuthenticatedUser) => ({
  id: user.id,
  fullName: user.fullName,
  username: user.username,
  mobile: user.mobile ? maskMobile(user.mobile) : null,
  email: user.email,
  role: user.role,
  familyId: user.familyId,
  avatarUrl: user.avatarUrl ?? null,
});

export const jsonSafe = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    if ('toNumber' in value && typeof (value as { toNumber?: unknown }).toNumber === 'function') {
      return (value as { toNumber: () => number }).toNumber();
    }
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, jsonSafe(nested)]));
  }
  return value;
};
