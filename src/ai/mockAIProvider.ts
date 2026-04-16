import { IAIProvider } from './aiProvider';
import { ChatMessage, AICompletionOptions } from '../types';

const CANNED_QUESTIONS = [
  "Thanks for reaching out! What specific service are you looking for help with?",
  "Great! What's your timeline — are you looking to get started within the next 30 days?",
  "What's your approximate budget for this project?",
  "Have you worked with a similar service provider before?",
];

export class MockAIProvider implements IAIProvider {
  readonly name = 'mock';
  private callCount = 0;

  async complete(prompt: string, _options?: AICompletionOptions): Promise<string> {
    void prompt;
    return `Mock response to: ${prompt.slice(0, 50)}...`;
  }

  async chat(messages: ChatMessage[], _options?: AICompletionOptions): Promise<string> {
    const userMessages = messages.filter(m => m.role === 'user').length;

    if (userMessages >= 4) {
      return `###QUALIFICATION_COMPLETE###
{"score":"WARM","reason":"Engaged but timeline unclear","budget":"medium","serviceInterest":"general"}`;
    }

    const question = CANNED_QUESTIONS[this.callCount % CANNED_QUESTIONS.length];
    this.callCount++;
    return question;
  }

  async completeJSON<T>(
    prompt: string,
    _schema: object,
    _options?: AICompletionOptions
  ): Promise<T> {
    void prompt;
    return { mock: true } as unknown as T;
  }
}
