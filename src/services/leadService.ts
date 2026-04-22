import { insertLead, findLeadByPhone, updateLead } from '../sheets/repositories/leadRepository';
import { insertMessage } from '../sheets/repositories/conversationRepository';
import { getMessagingProvider } from '../messaging/messagingFactory';
import { CreateLeadInput, LeadStatus, ConversationRole } from '../types';
import { logger } from '../utils/logger';

const SERVICE_OPTIONS: Record<string, string> = {
  'Web Development':
    `What do you need built?\n` +
    `1️⃣ New website from scratch\n` +
    `2️⃣ Redesign existing site\n` +
    `3️⃣ Custom web application\n` +
    `4️⃣ Ask your own question`,

  'Mobile App':
    `What are you looking to build?\n` +
    `1️⃣ iOS app\n` +
    `2️⃣ Android app\n` +
    `3️⃣ Both iOS & Android\n` +
    `4️⃣ Ask your own question`,

  'Digital Marketing':
    `What's your main focus?\n` +
    `1️⃣ Paid ads (Google / Meta)\n` +
    `2️⃣ Social media marketing\n` +
    `3️⃣ Email campaigns\n` +
    `4️⃣ Ask your own question`,

  'SEO':
    `Which best describes your goal?\n` +
    `1️⃣ Rank higher on Google\n` +
    `2️⃣ Drive more organic traffic\n` +
    `3️⃣ Local SEO / Google Maps\n` +
    `4️⃣ Ask your own question`,

  'Consulting':
    `What kind of support do you need?\n` +
    `1️⃣ Business strategy\n` +
    `2️⃣ Operations improvement\n` +
    `3️⃣ Digital transformation\n` +
    `4️⃣ Ask your own question`,
};

const DEFAULT_OPTIONS = (service: string) =>
  `What aspect of ${service} interests you most?\n` +
  `1️⃣ Getting started\n` +
  `2️⃣ Pricing & packages\n` +
  `3️⃣ Talk to an expert\n` +
  `4️⃣ Ask your own question`;

const WELCOME_MESSAGE = (name: string, service: string) => {
  const options = SERVICE_OPTIONS[service] ?? DEFAULT_OPTIONS(service);
  return `Hi ${name}! Thanks for your interest in ${service}.\n\n${options}\n\nReply with the number of your choice to get started! 🚀`;
};

export async function createLead(input: CreateLeadInput) {
  const start = Date.now();

  const existing = await findLeadByPhone(input.phone);
  if (existing) {
    logger.info(`Lead already exists for phone ${input.phone}`, { leadId: existing.id });
    const err = new Error(`Lead already exists for phone ${input.phone}`) as Error & { code: string; lead: typeof existing };
    err.code = 'DUPLICATE_PHONE';
    err.lead = existing;
    throw err;
  }

  const lead = await insertLead(input);
  logger.info(`Lead created`, { leadId: lead.id, phone: lead.phone });

  const whatsapp = getMessagingProvider('whatsapp');
  const welcomeText = WELCOME_MESSAGE(lead.name, lead.serviceInterest);

  const result = await whatsapp.send({ to: lead.phone, message: welcomeText });

  if (result.success) {
    await insertMessage(lead.id, ConversationRole.ASSISTANT, welcomeText, 'whatsapp');
    logger.info(`Welcome message sent to lead ${lead.id}`);
  } else {
    logger.warn(`Welcome message failed for lead ${lead.id}`);
    await insertMessage(lead.id, ConversationRole.ASSISTANT, welcomeText, 'whatsapp');
  }

  const responseTimeMs = Date.now() - start;
  const updated = await updateLead(lead.id, {
    status: LeadStatus.QUALIFYING,
    responseTimeMs,
  });

  logger.info(`Lead moved to QUALIFYING in ${responseTimeMs}ms`, { leadId: lead.id });

  return updated ?? lead;
}
