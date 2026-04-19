import { GoogleGenAI } from '@google/genai';
import { IAIProvider } from './aiProvider';
import { ChatMessage, AICompletionOptions } from '../types';
import { config } from '../config';

export class GeminiProvider implements IAIProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: config.ai.geminiApiKey });
  }

  async complete(prompt: string, options?: AICompletionOptions): Promise<string> {
    const response = await this.client.models.generateContent({
      model: config.ai.geminiModel,
      contents: prompt,
      config: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 1024,
      },
    });
    return response.text ?? '';
  }

  async chat(messages: ChatMessage[], options?: AICompletionOptions): Promise<string> {
    // Gemini uses a system instruction + conversation turns
    const systemMsg = messages.find(m => m.role === 'system');
    const turns = messages.filter(m => m.role !== 'system');

    let contents = turns.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    // Gemini requires conversations to start with a user turn.
    // The welcome message is stored as assistant — drop any leading model turns.
    const firstUserIdx = contents.findIndex(c => c.role === 'user');
    if (firstUserIdx > 0) contents = contents.slice(firstUserIdx);

    const response = await this.client.models.generateContent({
      model: config.ai.geminiModel,
      contents,
      config: {
        systemInstruction: systemMsg?.content,
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 1024,
      },
    });

    return response.text ?? '';
  }

  async completeJSON<T>(prompt: string, _schema: object, options?: AICompletionOptions): Promise<T> {
    const raw = await this.complete(prompt, options);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini did not return valid JSON');
    return JSON.parse(match[0]) as T;
  }
}
