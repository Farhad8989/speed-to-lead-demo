import { Lead, SalesRep } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!config.email.sendgridApiKey) {
    logger.warn('[ALERT] SENDGRID_API_KEY not set — email skipped');
    throw new Error('SENDGRID_API_KEY not set');
  }

  logger.info(`[ALERT] Sending email via SendGrid — from: ${config.email.from} to: ${to}, subject: ${subject}`);

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.email.sendgridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: config.email.from, name: config.email.fromName },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SendGrid ${res.status}: ${body}`);
  }
}

export async function alertHotLead(lead: Lead, rep: SalesRep): Promise<void> {
  const subject = `HOT LEAD: ${lead.name} — ${lead.serviceInterest}`;

  const html = `
    <h2>Hot Lead Assigned to You</h2>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:8px;font-weight:bold">Name</td><td style="padding:8px">${lead.name}</td></tr>
      <tr><td style="padding:8px;font-weight:bold">Phone</td><td style="padding:8px">${lead.phone}</td></tr>
      <tr><td style="padding:8px;font-weight:bold">Email</td><td style="padding:8px">${lead.email || '—'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold">Service Interest</td><td style="padding:8px">${lead.serviceInterest}</td></tr>
      <tr><td style="padding:8px;font-weight:bold">Score</td><td style="padding:8px">${lead.score}</td></tr>
      <tr><td style="padding:8px;font-weight:bold">Notes</td><td style="padding:8px">${lead.notes || '—'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold">Qualified At</td><td style="padding:8px">${lead.qualifiedAt}</td></tr>
    </table>
    <p>The lead has been sent your booking link. Expect them to schedule a call soon.</p>
  `;

  logger.info(`[ALERT] Emailing rep ${rep.name} <${rep.email}> for lead ${lead.id}`);

  try {
    await sendEmail(rep.email, subject, html);
    logger.info(`[ALERT] Email sent successfully to ${rep.email}`);
  } catch (err) {
    logger.error(`[ALERT] Failed to send email to ${rep.email}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (config.alerts.webhookUrl) {
    try {
      const text = `HOT LEAD: ${lead.name} (${lead.phone}) — ${lead.serviceInterest} — assigned to ${rep.name}`;
      await fetch(config.alerts.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      logger.error(`[ALERT] Failed to send Slack webhook: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
