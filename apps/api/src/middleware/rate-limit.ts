import type { RequestHandler } from 'express';
import { ApiError } from '../utils/api-error';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  key?: (request: Parameters<RequestHandler>[0]) => string;
};

type Counter = { count: number; resetAt: number };

/**
 * Small in-process guard for development and a single API process. Deployments with
 * multiple instances should replace the backing store with Redis or an API gateway.
 */
export const createRateLimit = ({ windowMs, max, key = (request) => request.ip }: RateLimitOptions): RequestHandler => {
  const counters = new Map<string, Counter>();
  let lastSweep = 0;

  return (request, response, next) => {
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      for (const [counterKey, counter] of counters) {
        if (counter.resetAt <= now) counters.delete(counterKey);
      }
      lastSweep = now;
    }
    const counterKey = key(request);
    const current = counters.get(counterKey);
    const counter = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;
    counter.count += 1;
    counters.set(counterKey, counter);

    response.setHeader('RateLimit-Limit', String(max));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, max - counter.count)));
    response.setHeader('RateLimit-Reset', String(Math.ceil(counter.resetAt / 1_000)));
    if (counter.count > max) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((counter.resetAt - now) / 1_000))));
      return next(new ApiError(429, 'Too many requests. Please try again later.'));
    }
    return next();
  };
};

export const otpRateLimit = createRateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  key: (request) => `${request.ip}:${typeof request.body?.mobile === 'string' ? request.body.mobile.replace(/\D/g, '') : ''}`,
});
