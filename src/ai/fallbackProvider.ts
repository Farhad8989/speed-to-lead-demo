import { IAIProvider } from './aiProvider';
import { ChatMessage, AICompletionOptions } from '../types';
import { logger } from '../utils/logger';

function isTransient(err: any): boolean {
  const status = err?.status ?? err?.code ?? err?.statusCode;
  return status === 503 || status === 429;
}

export class FallbackAIProvider implements IAIProvider {
  readonly name: string;

  constructor(private primary: IAIProvider, private fallback: IAIProvider) {
    this.name = `${primary.name}+fallback(${fallback.name})`;
  }

  async complete(prompt: string, options?: AICompletionOptions): Promise<string> {
    try {
      return await this.primary.complete(prompt, options);
    } catch (err) {
      if (!isTransient(err)) throw err;
      logger.warn(`[AI] ${this.primary.name} unavailable (${(err as any)?.status ?? 'err'}) — falling back to ${this.fallback.name}`);
      return this.fallback.complete(prompt, options);
    }
  }

  async chat(messages: ChatMessage[], options?: AICompletionOptions): Promise<string> {
    try {
      return await this.primary.chat(messages, options);
    } catch (err) {
      if (!isTransient(err)) throw err;
      logger.warn(`[AI] ${this.primary.name} unavailable (${(err as any)?.status ?? 'err'}) — falling back to ${this.fallback.name}`);
      return this.fallback.chat(messages, options);
    }
  }

  async completeJSON<T>(prompt: string, schema: object, options?: AICompletionOptions): Promise<T> {
    try {
      return await this.primary.completeJSON<T>(prompt, schema, options);
    } catch (err) {
      if (!isTransient(err)) throw err;
      logger.warn(`[AI] ${this.primary.name} unavailable (${(err as any)?.status ?? 'err'}) — falling back to ${this.fallback.name}`);
      return this.fallback.completeJSON<T>(prompt, schema, options);
    }
  }
}
