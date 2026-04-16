import nodemailer from 'nodemailer';
import { IMessagingProvider } from './messagingProvider';
import { SendMessageOptions, SendMessageResult } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class EmailProvider implements IMessagingProvider {
  readonly channel = 'email' as const;
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.smtpHost,
      port: config.email.smtpPort,
      secure: false,
      auth: config.email.smtpUser
        ? { user: config.email.smtpUser, pass: config.email.smtpPass }
        : undefined,
    });
  }

  async send(options: SendMessageOptions): Promise<SendMessageResult> {
    try {
      const info = await this.transporter.sendMail({
        from: config.email.from,
        to: options.to,
        subject: options.subject ?? 'Message from SpeedToLead',
        text: options.message,
      });

      logger.info(`[EMAIL] Sent to ${options.to}`, { messageId: info.messageId });
      return { messageId: info.messageId ?? uuidv4(), success: true };
    } catch (err: any) {
      logger.error(`[EMAIL] Failed to send to ${options.to}`, { error: err.message });
      return { messageId: '', success: false };
    }
  }
}
