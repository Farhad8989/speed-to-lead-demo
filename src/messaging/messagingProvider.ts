import { SendMessageOptions, SendMessageResult } from '../types';

export interface IMessagingProvider {
  readonly channel: 'whatsapp' | 'email' | 'sms';
  send(options: SendMessageOptions): Promise<SendMessageResult>;
}
