import { IAIProvider } from './aiProvider';
import { MockAIProvider } from './mockAIProvider';
import { OpenRouterProvider } from './openaiProvider';
import { GeminiProvider } from './geminiProvider';
import { config } from '../config';

let instance: IAIProvider | null = null;

export function getAIProvider(): IAIProvider {
  if (instance) return instance;
  switch (config.ai.provider.toLowerCase().trim()) {
    case 'gemini':    instance = new GeminiProvider(); break;
    case 'openrouter': instance = new OpenRouterProvider(); break;
    default:          instance = new MockAIProvider();
  }
  return instance;
}
