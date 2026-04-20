import { IAIProvider } from './aiProvider';
import { ChatMessage, AICompletionOptions } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

export class OpenRouterProvider implements IAIProvider {
  readonly name = 'openrouter';

  private async callAPI(messages: { role: string; content: string }[], retries = 3): Promise<string> {
    const body = JSON.stringify({
      model: config.ai.openRouterModel,
      messages,
    });

    for (let attempt = 0; attempt < retries; attempt++) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.ai.openRouterApiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      if (res.ok) {
        const data = await res.json() as { choices: { message: { content: string } }[] };
        return data.choices[0]?.message?.content ?? '';
      }

      const err = await res.text();
      const isTransient = res.status === 429 || res.status === 503 ||
        (res.status === 404 && err.includes('No endpoints found'));

      if (isTransient && attempt < retries - 1) {
        logger.warn(`[OPENROUTER] Transient error ${res.status} — retrying (${attempt + 1}/${retries - 1})`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }

      logger.error('[OPENROUTER] API error', { status: res.status, err });
      const e: any = new Error(`OpenRouter error ${res.status}: ${err}`);
      e.status = res.status;
      throw e;
    }
    throw new Error('Unreachable');
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
