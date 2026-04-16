import https from 'https';
import { IMessagingProvider } from './messagingProvider';
import { SendMessageOptions, SendMessageResult } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class MetaWhatsAppProvider implements IMessagingProvider {
  readonly channel = 'whatsapp' as const;

  async send(options: SendMessageOptions): Promise<SendMessageResult> {
    const to = options.to.replace(/^whatsapp:/i, '').replace(/\s+/g, '');

    if (options.useTemplate) {
      return this.sendTemplate(to, options.templateName ?? config.meta.template, options.templateVars);
    }
    return this.sendText(to, options.message);
  }

  private post(payload: string): Promise<SendMessageResult> {
    const { phoneNumberId, accessToken, apiVersion } = config.meta;

    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: 'graph.facebook.com',
          path: `/${apiVersion}/${phoneNumberId}/messages`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (res.statusCode === 200 && data.messages?.[0]?.id) {
                logger.info(`[META WHATSAPP] Delivered`, { messageId: data.messages[0].id });
                resolve({ messageId: data.messages[0].id, success: true });
              } else {
                logger.error(`[META WHATSAPP] API error`, { status: res.statusCode, body });
                resolve({ messageId: '', success: false });
              }
            } catch {
              logger.error(`[META WHATSAPP] Failed to parse response`, { body });
              resolve({ messageId: uuidv4(), success: false });
            }
          });
        }
      );

      req.on('error', (err) => {
        logger.error(`[META WHATSAPP] Request error`, { error: err.message });
        resolve({ messageId: '', success: false });
      });

      req.write(payload);
      req.end();
    });
  }

  private sendText(to: string, message: string): Promise<SendMessageResult> {
    logger.info(`[META WHATSAPP] Sending text to ${to}`);
    const payload = JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message },
    });
    return this.post(payload);
  }

  private sendTemplate(to: string, templateName: string, vars?: string[]): Promise<SendMessageResult> {
    logger.info(`[META WHATSAPP] Sending template "${templateName}" to ${to}`, { vars });
    const template: Record<string, unknown> = {
      name: templateName,
      language: { code: 'en_US' },
    };

    if (vars?.length) {
      template.components = [
        {
          type: 'body',
          parameters: vars.map(v => ({ type: 'text', text: v })),
        },
      ];
    }

    const payload = JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template });
    return this.post(payload);
  }
}
