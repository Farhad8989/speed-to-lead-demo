import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const TTL_MS = 5 * 60_000; // keep SIDs for 5 minutes (covers Twilio's retry window)

const seen = new Map<string, number>(); // sid → timestamp

function pruneExpired(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [sid, ts] of seen) {
    if (ts < cutoff) seen.delete(sid);
  }
}

export function twilioIdempotency(req: Request, res: Response, next: NextFunction): void {
  const sid: string = req.body?.MessageSid ?? '';
  if (!sid) {
    next();
    return;
  }

  pruneExpired();

  if (seen.has(sid)) {
    logger.warn(`[IDEMPOTENCY] Duplicate Twilio message ${sid} — skipping`);
    res.status(200).set('Content-Type', 'text/xml').send('<Response/>');
    return;
  }

  seen.set(sid, Date.now());
  next();
}
