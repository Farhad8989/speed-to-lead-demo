import { Lead, LeadScore, LeadStatus, ChatMessage, ConversationRole } from '../types';
import { getAIProvider } from '../ai/aiFactory';
import { buildQualificationPrompt } from '../ai/prompts';
import { getKnowledge } from './knowledgeService';
import { getConversationByLeadId, insertMessage } from '../sheets/repositories/conversationRepository';
import { updateLead } from '../sheets/repositories/leadRepository';
import { logger } from '../utils/logger';

interface QualificationResult {
  score: LeadScore;
  reason: string;
  budget: string;
  serviceInterest: string;
}

export interface ProcessReplyResult {
  replyText: string;
  isComplete: boolean;
  qualificationResult?: QualificationResult;
}

function buildSystemMessage(lead: Lead): ChatMessage {
  const knowledge = getKnowledge(lead.serviceInterest);
  const systemPrompt = buildQualificationPrompt(knowledge);
  return {
    role: 'system',
    content: `${systemPrompt}\n\nLead name: ${lead.name}\nService interest: ${lead.serviceInterest}`,
  };
}

function parseQualificationResult(aiReply: string): QualificationResult | null {
  try {
    const jsonMatch = aiReply.match(/###QUALIFICATION_COMPLETE###\s*(\{[\s\S]*\})/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[1]);
    return {
      score: (parsed.score as LeadScore) ?? LeadScore.COLD,
      reason: parsed.reason ?? '',
      budget: parsed.budget ?? 'unknown',
      serviceInterest: parsed.serviceInterest ?? '',
    };
  } catch {
    return null;
  }
}

export async function processReply(lead: Lead, userMessage: string): Promise<ProcessReplyResult> {
  await insertMessage(lead.id, ConversationRole.USER, userMessage, 'whatsapp');

  const history = await getConversationByLeadId(lead.id);
  const chatMessages: ChatMessage[] = [
    buildSystemMessage(lead),
    ...history.map(m => ({
      role: m.role === ConversationRole.USER ? 'user' as const : 'assistant' as const,
      content: m.content,
    })),
  ];

  const ai = getAIProvider();
  const aiReply = await ai.chat(chatMessages);

  if (aiReply.includes('###QUALIFICATION_COMPLETE###')) {
    const result = parseQualificationResult(aiReply);
    if (result) {
      logger.info(`[QUALIFICATION] Lead ${lead.id} qualified as ${result.score}`);
      return { replyText: aiReply, isComplete: true, qualificationResult: result };
    }
  }

  return { replyText: aiReply, isComplete: false };
}

export async function finalize(lead: Lead, result: QualificationResult): Promise<Lead> {
  const updated = await updateLead(lead.id, {
    score: result.score,
    status: LeadStatus.QUALIFIED,
    qualifiedAt: new Date().toISOString(),
    notes: result.reason,
  });

  if (!updated) {
    logger.error(`[QUALIFICATION] Failed to update lead ${lead.id} after finalization`);
    return lead;
  }

  logger.info(`[QUALIFICATION] Lead ${lead.id} finalized — score: ${result.score}`);
  return updated;
}
