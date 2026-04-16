import { Router, Request, Response } from 'express';
import { findLeadByPhone } from '../sheets/repositories/leadRepository';
import { getConversationByLeadId, insertMessage } from '../sheets/repositories/conversationRepository';
import { getMessagingProvider } from '../messaging/messagingFactory';
import { getAIProvider } from '../ai/aiFactory';
import { ConversationRole } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { QUALIFICATION_SYSTEM_PROMPT } from '../ai/prompts';

const router = Router();

// ── Meta WhatsApp Cloud API webhook ──────────────────────────────────────────

router.get('/meta', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.meta.webhookVerifyToken) {
    logger.info('[META WEBHOOK] Verified');
    res.status(200).send(challenge);
  } else {
    logger.warn('[META WEBHOOK] Verification failed');
    res.sendStatus(403);
  }
});

router.post('/meta', async (req: Request, res: Response) => {
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages?.length) return;

    for (const msg of messages) {
      const phone = `+${msg.from}`;
      const text: string = msg.text?.body ?? msg.type ?? '';

      logger.info(`[META WEBHOOK] Inbound message from ${phone}`, { text });

      const lead = await findLeadByPhone(phone);
      if (!lead) {
        logger.warn(`[META WEBHOOK] No lead found for ${phone}`);
        continue;
      }

      await insertMessage(lead.id, ConversationRole.USER, text, 'whatsapp');

      const history = await getConversationByLeadId(lead.id);
      const chatMessages = [
        {
          role: 'system' as const,
          content:
            `${QUALIFICATION_SYSTEM_PROMPT}\n\n` +
            `Lead name: ${lead.name}\n` +
            `Service interest: ${lead.serviceInterest}\n` +
            `Keep replies concise and friendly, under 150 words. ` +
            `If the user picks a numbered option (1-3), acknowledge it and ask a relevant follow-up. ` +
            `If they pick 4 or ask a free-form question, answer it helpfully as a sales expert for ${lead.serviceInterest}.`,
        },
        ...history.map(m => ({
          role: m.role === ConversationRole.USER ? 'user' as const : 'assistant' as const,
          content: m.content,
        })),
      ];

      const ai = getAIProvider();
      const aiReply = await ai.chat(chatMessages);

      const replyText = aiReply.includes('###QUALIFICATION_COMPLETE###')
        ? `Thanks ${lead.name}! Based on our chat, one of our specialists will be in touch with you shortly. 🚀`
        : aiReply;

      const whatsapp = getMessagingProvider('whatsapp');
      const result = await whatsapp.send({ to: phone, message: replyText });

      if (result.success) {
        await insertMessage(lead.id, ConversationRole.ASSISTANT, replyText, 'whatsapp');
        logger.info(`[META WEBHOOK] AI reply sent to lead ${lead.id}`);
      } else {
        logger.warn(`[META WEBHOOK] Failed to send AI reply to lead ${lead.id}`);
      }
    }
  } catch (err) {
    logger.error('[META WEBHOOK] Error processing inbound message', { error: err });
  }
});

// ── Twilio webhook ────────────────────────────────────────────────────────────

router.post('/twilio', async (req: Request, res: Response) => {
  const from: string = req.body?.From ?? '';   // e.g. "whatsapp:+601124249650"
  const body: string = req.body?.Body ?? '';
  const phone = from.replace(/^whatsapp:/i, '');

  logger.info(`[TWILIO WEBHOOK] Inbound WhatsApp from ${phone}`, { body });

  let replyText = '';

  try {
    if (phone && body) {
      const lead = await findLeadByPhone(phone);
      if (!lead) {
        logger.warn(`[TWILIO WEBHOOK] No lead found for ${phone}`);
      } else {
        await insertMessage(lead.id, ConversationRole.USER, body, 'whatsapp');

        const history = await getConversationByLeadId(lead.id);
        const chatMessages = [
          {
            role: 'system' as const,
            content:
              `${QUALIFICATION_SYSTEM_PROMPT}\n\n` +
              `Lead name: ${lead.name}\n` +
              `Service interest: ${lead.serviceInterest}\n` +
              `Keep replies concise and friendly, under 150 words. ` +
              `If the user picks a numbered option (1-3), acknowledge it and ask a relevant follow-up. ` +
              `If they pick 4 or ask a free-form question, answer it helpfully as a sales expert for ${lead.serviceInterest}.`,
          },
          ...history.map(m => ({
            role: m.role === ConversationRole.USER ? 'user' as const : 'assistant' as const,
            content: m.content,
          })),
        ];

        const ai = getAIProvider();
        const aiReply = await ai.chat(chatMessages);

        replyText = aiReply.includes('###QUALIFICATION_COMPLETE###')
          ? `Thanks ${lead.name}! Based on our chat, one of our specialists will be in touch with you shortly. 🚀`
          : aiReply;

        await insertMessage(lead.id, ConversationRole.ASSISTANT, replyText, 'whatsapp');
        logger.info(`[TWILIO WEBHOOK] AI reply stored for lead ${lead.id}`);
      }
    }
  } catch (err) {
    logger.error('[TWILIO WEBHOOK] Error processing inbound message', { error: err });
  }

  // Respond with TwiML — Twilio delivers this as the WhatsApp reply
  const safe = replyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const twiml = replyText
    ? `<Response><Message>${safe}</Message></Response>`
    : `<Response/>`;

  res.status(200).set('Content-Type', 'text/xml').send(twiml);
});

export default router;
