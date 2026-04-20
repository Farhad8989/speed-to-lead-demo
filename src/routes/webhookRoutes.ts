import { Router, Request, Response } from 'express';
import { findLeadByPhone } from '../sheets/repositories/leadRepository';
import { insertMessage } from '../sheets/repositories/conversationRepository';
import { getMessagingProvider } from '../messaging/messagingFactory';
import { processReply, finalize } from '../services/qualificationService';
import { routeLead } from '../services/routingService';
import { ConversationRole } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

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
    const messages = entry?.changes?.[0]?.value?.messages;
    if (!messages?.length) return;

    for (const msg of messages) {
      const phone = `+${msg.from}`;
      const text: string = msg.text?.body ?? msg.type ?? '';

      logger.info(`[META WEBHOOK] Inbound from ${phone}`, { text });

      const lead = await findLeadByPhone(phone);
      if (!lead) {
        logger.warn(`[META WEBHOOK] No lead found for ${phone}`);
        continue;
      }

      const { replyText: aiReply, isComplete, qualificationResult } = await processReply(lead, text);

      let finalReply: string;
      if (isComplete && qualificationResult) {
        const qualified = await finalize(lead, qualificationResult);
        const { userMessage } = await routeLead(qualified);
        finalReply = userMessage;
      } else {
        finalReply = aiReply;
      }

      const whatsapp = getMessagingProvider('whatsapp');
      const result = await whatsapp.send({ to: phone, message: finalReply });

      if (result.success) {
        await insertMessage(lead.id, ConversationRole.ASSISTANT, finalReply, 'whatsapp');
        logger.info(`[META WEBHOOK] Reply sent to lead ${lead.id}`);
      } else {
        logger.warn(`[META WEBHOOK] Failed to send reply to lead ${lead.id}`);
      }
    }
  } catch (err) {
    logger.error('[META WEBHOOK] Error processing inbound message', { error: err });
  }
});

// ── Twilio webhook ────────────────────────────────────────────────────────────

router.post('/twilio', async (req: Request, res: Response) => {
  const from: string = req.body?.From ?? '';
  const body: string = req.body?.Body ?? '';
  const rawPhone = from.replace(/^whatsapp:/i, '').trim();
  const phone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;

  logger.info(`[TWILIO WEBHOOK] Inbound from ${phone}`, { body });

  let replyText = '';

  try {
    if (phone && body) {
      const lead = await findLeadByPhone(phone);
      if (!lead) {
        logger.warn(`[TWILIO WEBHOOK] No lead found for ${phone}`);
      } else {
        const { replyText: aiReply, isComplete, qualificationResult } = await processReply(lead, body);

        if (isComplete && qualificationResult) {
          const qualified = await finalize(lead, qualificationResult);
          const { userMessage } = await routeLead(qualified);
          replyText = userMessage;
        } else {
          replyText = aiReply;
        }

        await insertMessage(lead.id, ConversationRole.ASSISTANT, replyText, 'whatsapp');
        logger.info(`[TWILIO WEBHOOK] Reply stored for lead ${lead.id}`);
      }
    }
  } catch (err) {
    logger.error('[TWILIO WEBHOOK] Error processing inbound message', { error: err });
    replyText = "Sorry, I'm having a brief technical issue. Please reply again in a moment and I'll pick right up where we left off! 🙏";
  }

  // TwiML — Twilio delivers this as the WhatsApp reply
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
