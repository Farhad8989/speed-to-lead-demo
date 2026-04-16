import { IAIProvider } from './aiProvider';
import { MockAIProvider } from './mockAIProvider';
import { OpenRouterProvider } from './openaiProvider';
import { config } from '../config';

let instance: IAIProvider | null = null;

export function getAIProvider(): IAIProvider {
  if (instance) return instance;
  instance = config.ai.provider === 'openrouter' ? new OpenRouterProvider() : new MockAIProvider();
  return instance;
}
