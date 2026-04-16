import { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { config } from '../config';
import { logger } from '../utils/logger';

export function twilioValidator(req: Request, res: Response, next: NextFunction): void {
  // Skip validation in dev when no auth token is configured
  if (!config.twilio.authToken) {
    next();
    return;
  }

  const signature = req.headers['x-twilio-signature'] as string;
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const isValid = twilio.validateRequest(config.twilio.authToken, signature, url, req.body);

  if (!isValid) {
    logger.warn('Rejected request with invalid Twilio signature');
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}
