import { createHash, timingSafeEqual } from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest();

export function createPasswordVerifier(password) {
  if (!password) throw new Error('APP_PASSWORD must be set');
  const expected = sha256(password);
  return candidate => typeof candidate === 'string' && candidate.length > 0 && timingSafeEqual(sha256(candidate), expected);
}

export function createFailureLimiter({ maxFailures = 5, windowMs = 60_000 } = {}) {
  let count = 0;
  let windowStart = 0;
  const maybeReset = now => {
    if (count > 0 && now - windowStart >= windowMs) count = 0;
  };
  return {
    isBlocked() {
      maybeReset(Date.now());
      return count >= maxFailures;
    },
    recordFailure() {
      const now = Date.now();
      maybeReset(now);
      if (count === 0) windowStart = now;
      count++;
    },
    reset() {
      count = 0;
      windowStart = 0;
    },
  };
}

export function isSameOrigin(req) {
  const { origin, host } = req.headers;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export class PayloadTooLargeError extends Error {
  constructor(message = 'Request too large') {
    super(message);
    this.name = 'PayloadTooLargeError';
  }
}

export async function readBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) throw new PayloadTooLargeError();
    chunks.push(buf);
  }
  return Buffer.concat(chunks, total).toString('utf8');
}
