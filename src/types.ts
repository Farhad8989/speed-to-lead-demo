export enum LeadStatus {
  NEW = 'NEW',
  QUALIFYING = 'QUALIFYING',
  QUALIFIED = 'QUALIFIED',
  NURTURING = 'NURTURING',
  CONVERTED = 'CONVERTED',
  LOST = 'LOST',
}

export enum LeadScore {
  HOT = 'HOT',
  WARM = 'WARM',
  COLD = 'COLD',
  UNSCORED = 'UNSCORED',
}

export enum ConversationRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  serviceInterest: string;
  score: LeadScore;
  status: LeadStatus;
  assignedRepId: string;
  source: string;
  responseTimeMs: number;
  createdAt: string;
  updatedAt: string;
  qualifiedAt: string;
  notes: string;
}

export interface Conversation {
  id: string;
  leadId: string;
  role: ConversationRole;
  content: string;
  channel: string;
  createdAt: string;
}

export interface SalesRep {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  currentLeadCount: number;
  bookingLink: string;
}

export interface FollowUp {
  id: string;
  leadId: string;
  type: string;
  scheduledAt: string;
  executedAt: string;
  channel: string;
  message: string;
}

export interface LeadEvent {
  id: string;
  leadId: string;
  eventType: string;
  metadata: string;
  createdAt: string;
}

export type CreateLeadInput = {
  name: string;
  phone: string;
  email: string;
  serviceInterest: string;
  source?: string;
};

export interface SendMessageOptions {
  to: string;
  message: string;
  subject?: string;
  useTemplate?: boolean;
  templateName?: string;
  templateVars?: string[];
}

export interface SendMessageResult {
  messageId: string;
  success: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AICompletionOptions {
  temperature?: number;
  maxTokens?: number;
}
