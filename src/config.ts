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
    provider: optionalEnv('AI_PROVIDER', 'openrouter') as 'gemini' | 'openrouter' | 'mock',
    geminiApiKey: optionalEnv('GEMINI_API_KEY'),
    geminiModel: optionalEnv('GEMINI_MODEL', 'gemini-2.5-flash'),
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
    appSecret: optionalEnv('META_APP_SECRET'),
  },

  email: {
    sendgridApiKey: optionalEnv('SENDGRID_API_KEY'),
    from: optionalEnv('EMAIL_FROM', 'farhad.hossain1507@gmail.com'),
    fromName: optionalEnv('EMAIL_FROM_NAME', 'LeadBot'),
  },

  messaging: {
    mode: optionalEnv('MESSAGING_MODE', 'mock') as 'live' | 'mock',
    provider: optionalEnv('MESSAGING_PROVIDER', 'twilio') as 'twilio' | 'meta',
  },

  alerts: {
    webhookUrl: optionalEnv('ALERT_WEBHOOK_URL'),
  },

  app: {
    baseUrl: optionalEnv('APP_BASE_URL', 'https://speed-to-lead-demo.onrender.com'),
    debugSecret: optionalEnv('DEBUG_SECRET'),
    apiKey: optionalEnv('API_KEY'),
  },

  nurture: {
    // Delays in milliseconds — override via env vars (values are in hours)
    delay1Ms: parseInt(optionalEnv('NURTURE_DELAY_1_HOURS', '24'), 10) * 60 * 60 * 1000,
    delay2Ms: parseInt(optionalEnv('NURTURE_DELAY_2_HOURS', '72'), 10) * 60 * 60 * 1000,
    delay3Ms: parseInt(optionalEnv('NURTURE_DELAY_3_HOURS', '168'), 10) * 60 * 60 * 1000,
  },
} as const;
