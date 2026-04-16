import { IMessagingProvider } from './messagingProvider';
import { MockMessagingProvider } from './mockMessagingProvider';
import { MetaWhatsAppProvider } from './metaWhatsappProvider';
import { WhatsAppProvider } from './whatsappProvider';
import { EmailProvider } from './emailProvider';
import { config } from '../config';

export function getMessagingProvider(
  channel: 'whatsapp' | 'email' | 'sms' = 'whatsapp'
): IMessagingProvider {
  if (config.messaging.mode === 'mock') {
    return new MockMessagingProvider(channel);
  }

  switch (channel) {
    case 'whatsapp':
      return config.messaging.provider === 'twilio'
        ? new WhatsAppProvider()
        : new MetaWhatsAppProvider();
    case 'email':
      return new EmailProvider();
    default:
      return new MockMessagingProvider(channel);
  }
}
