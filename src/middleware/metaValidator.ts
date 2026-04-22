import { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

export function metaValidator(req: Request, res: Response, next: NextFunction): void {
  if (!config.meta.appSecret) {
    next();
    return;
  }

  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) {
    logger.warn('[META VALIDATOR] Missing X-Hub-Signature-256 header');
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const rawBody: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body));
  const expected = `sha256=${createHmac('sha256', config.meta.appSecret).update(rawBody).digest('hex')}`;

  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new Error('Signature mismatch');
    }
  } catch {
    logger.warn('[META VALIDATOR] Invalid X-Hub-Signature-256');
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}
