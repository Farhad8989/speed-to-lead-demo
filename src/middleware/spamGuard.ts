import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const DEBOUNCE_MS = 3_000;       // min gap between messages from same phone
const WINDOW_MS = 5 * 60_000;   // rolling window
const MAX_IN_WINDOW = 10;        // max messages per phone per window

interface PhoneRecord {
  lastAt: number;
  timestamps: number[];
}

const phoneMap = new Map<string, PhoneRecord>();

// Prune entries older than 10 minutes to prevent unbounded growth
function pruneOldEntries(): void {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [phone, rec] of phoneMap) {
    if (rec.lastAt < cutoff) phoneMap.delete(phone);
  }
}

export function spamGuard(req: Request, res: Response, next: NextFunction): void {
  const from: string = req.body?.From ?? '';
  const rawPhone = from.replace(/^whatsapp:/i, '').trim();
  const phone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;

  if (!phone || phone === '+') {
    next();
    return;
  }

  pruneOldEntries();

  const now = Date.now();
  const rec = phoneMap.get(phone) ?? { lastAt: 0, timestamps: [] };

  // Debounce — reject if too soon after last message
  if (now - rec.lastAt < DEBOUNCE_MS) {
    logger.warn(`[SPAM GUARD] Debounce hit for ${phone} (${now - rec.lastAt}ms since last)`);
    res.status(200).set('Content-Type', 'text/xml').send('<Response/>');
    return;
  }

  // Rate limit — drop timestamps outside the rolling window
  rec.timestamps = rec.timestamps.filter(t => now - t < WINDOW_MS);
  if (rec.timestamps.length >= MAX_IN_WINDOW) {
    logger.warn(`[SPAM GUARD] Rate limit hit for ${phone} (${rec.timestamps.length} msgs in window)`);
    res.status(200).set('Content-Type', 'text/xml').send('<Response/>');
    return;
  }

  rec.lastAt = now;
  rec.timestamps.push(now);
  phoneMap.set(phone, rec);

  next();
}
