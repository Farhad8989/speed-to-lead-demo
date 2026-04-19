import { IMessagingProvider } from './messagingProvider';
import { SendMessageOptions, SendMessageResult } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class EmailProvider implements IMessagingProvider {
  readonly channel = 'email' as const;

  async send(options: SendMessageOptions): Promise<SendMessageResult> {
    if (!config.email.sendgridApiKey) {
      logger.warn('[EMAIL] SENDGRID_API_KEY not set — skipping');
      return { messageId: '', success: false };
    }

    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.email.sendgridApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: options.to }] }],
          from: { email: config.email.from, name: config.email.fromName },
          subject: options.subject ?? 'Message from SpeedToLead',
          content: [{ type: 'text/plain', value: options.message }],
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`SendGrid ${res.status}: ${err}`);
      }

      const messageId = uuidv4();
      logger.info(`[EMAIL] Sent to ${options.to}`);
      return { messageId, success: true };
    } catch (err: any) {
      logger.error(`[EMAIL] Failed to send to ${options.to}`, { error: err.message });
      return { messageId: '', success: false };
    }
  }
}
