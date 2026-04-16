import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optionalEnv(key: string, defaultVal = ''): string {
  return process.env[key] ?? defaultVal;
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),

  ai: {
    provider: optionalEnv('AI_PROVIDER', 'openrouter') as 'openrouter' | 'mock',
    openRouterApiKey: optionalEnv('OPENROUTER_API_KEY'),
    openRouterModel: optionalEnv('OPENROUTER_MODEL', 'meta-llama/llama-3.3-70b-instruct:free'),
  },

  google: {
    sheetsId: requireEnv('GOOGLE_SHEETS_ID'),
    serviceAccountKeyFile: optionalEnv(
      'GOOGLE_SERVICE_ACCOUNT_KEY_FILE',
      './credentials/service-account.json'
    ),
    serviceAccountJson: optionalEnv('GOOGLE_SERVICE_ACCOUNT_JSON'),
  },

  twilio: {
    accountSid: optionalEnv('TWILIO_ACCOUNT_SID'),
    authToken: optionalEnv('TWILIO_AUTH_TOKEN'),
    whatsappFrom: optionalEnv('TWILIO_WHATSAPP_FROM', 'whatsapp:+14155238886'),
  },

  meta: {
    phoneNumberId: optionalEnv('META_PHONE_NUMBER_ID'),
    accessToken: optionalEnv('META_ACCESS_TOKEN'),
    apiVersion: optionalEnv('META_WHATSAPP_API_VERSION', 'v25.0'),
    template: optionalEnv('META_WHATSAPP_TEMPLATE', 'hello_world'),
    serviceTemplate: optionalEnv('META_WHATSAPP_SERVICE_TEMPLATE', 'service_welcome'),
    webhookVerifyToken: optionalEnv('META_WEBHOOK_VERIFY_TOKEN', 'speedtolead_verify_2026'),
  },

  email: {
    smtpHost: optionalEnv('SMTP_HOST', 'smtp.ethereal.email'),
    smtpPort: parseInt(optionalEnv('SMTP_PORT', '587'), 10),
    smtpUser: optionalEnv('SMTP_USER'),
    smtpPass: optionalEnv('SMTP_PASS'),
    from: optionalEnv('EMAIL_FROM', 'leads@speedtolead.demo'),
  },

  messaging: {
    mode: optionalEnv('MESSAGING_MODE', 'mock') as 'live' | 'mock',
    provider: optionalEnv('MESSAGING_PROVIDER', 'twilio') as 'twilio' | 'meta',
  },

  alerts: {
    webhookUrl: optionalEnv('ALERT_WEBHOOK_URL'),
  },
} as const;
