import { IMessagingProvider } from './messagingProvider';
import { SendMessageOptions, SendMessageResult } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class MockMessagingProvider implements IMessagingProvider {
  readonly channel: 'whatsapp' | 'email' | 'sms';

  constructor(channel: 'whatsapp' | 'email' | 'sms' = 'whatsapp') {
    this.channel = channel;
  }

  async send(options: SendMessageOptions): Promise<SendMessageResult> {
    const messageId = uuidv4();
    logger.info(`[MOCK ${this.channel.toUpperCase()}] → ${options.to}`, {
      subject: options.subject,
      message: options.message.slice(0, 80),
    });
    return { messageId, success: true };
  }
}
