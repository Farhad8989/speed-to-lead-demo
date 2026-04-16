import { IAIProvider } from './aiProvider';
import { ChatMessage, AICompletionOptions } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

export class OpenRouterProvider implements IAIProvider {
  readonly name = 'openrouter';

  private async callAPI(messages: { role: string; content: string }[]): Promise<string> {
    const body = JSON.stringify({
      model: config.ai.openRouterModel,
      messages,
    });

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.ai.openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error('[OPENROUTER] API error', { status: res.status, err });
      throw new Error(`OpenRouter error ${res.status}: ${err}`);
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content ?? '';
  }

  async complete(prompt: string, _options?: AICompletionOptions): Promise<string> {
    return this.callAPI([{ role: 'user', content: prompt }]);
  }

  async chat(messages: ChatMessage[], _options?: AICompletionOptions): Promise<string> {
    return this.callAPI(messages.map(m => ({ role: m.role, content: m.content })));
  }

  async completeJSON<T>(prompt: string, _schema: object, _options?: AICompletionOptions): Promise<T> {
    const raw = await this.complete(prompt);
    return JSON.parse(raw) as T;
  }
}
