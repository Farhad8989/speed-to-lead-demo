import twilio from 'twilio';
import { IMessagingProvider } from './messagingProvider';
import { SendMessageOptions, SendMessageResult } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

export class WhatsAppProvider implements IMessagingProvider {
  readonly channel = 'whatsapp' as const;
  private client: twilio.Twilio;

  constructor() {
    this.client = twilio(config.twilio.accountSid, config.twilio.authToken);
  }

  async send(options: SendMessageOptions): Promise<SendMessageResult> {
    const to = options.to.startsWith('whatsapp:') ? options.to : `whatsapp:${options.to}`;
    const from = config.twilio.whatsappFrom;

    try {
      const msg = await this.client.messages.create({
        from,
        to,
        body: options.message,
      });

      logger.info(`[WHATSAPP] Sent to ${to}`, { sid: msg.sid });
      return { messageId: msg.sid, success: true };
    } catch (err: any) {
      logger.error(`[WHATSAPP] Failed to send to ${to}`, { error: err.message });
      return { messageId: '', success: false };
    }
  }
}
