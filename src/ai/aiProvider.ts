import { ChatMessage, AICompletionOptions } from '../types';

export interface IAIProvider {
  readonly name: string;
  complete(prompt: string, options?: AICompletionOptions): Promise<string>;
  chat(messages: ChatMessage[], options?: AICompletionOptions): Promise<string>;
  completeJSON<T>(prompt: string, schema: object, options?: AICompletionOptions): Promise<T>;
}
