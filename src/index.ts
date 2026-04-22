import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { config } from './config';
import { logger } from './utils/logger';
import { setupSheets } from './sheets/sheetsSetup';
import { seedDemoReps } from './sheets/repositories/repRepository';
import { requestLogger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import leadRoutes from './routes/leadRoutes';
import webhookRoutes from './routes/webhookRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import bookingRoutes from './routes/bookingRoutes';
import bookTokenRoutes from './routes/bookTokenRoutes';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.app.baseUrl }));
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));
app.use(express.json({
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    aiProvider: config.ai.provider,
    aiProviderRaw: process.env.AI_PROVIDER ?? '(not set)',
    aiModel: config.ai.provider === 'gemini' ? config.ai.geminiModel : config.ai.openRouterModel,
  });
});

function requireDebugSecret(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  const secret = config.app.debugSecret;
  if (secret && req.query.secret !== secret) {
    res.status(403).json({ ok: false, error: 'Forbidden' });
    return;
  }
  next();
}

app.post('/api/debug/reset', requireDebugSecret, async (_req, res) => {
  try {
    const { clearTabData } = await import('./sheets/sheetsClient');
    await Promise.all(['Leads', 'Conversations', 'FollowUps', 'Events', 'SalesReps'].map(clearTabData));
    const { seedDemoReps: reseed } = await import('./sheets/repositories/repRepository');
    await reseed();
    res.json({ ok: true, message: 'Leads, Conversations, FollowUps, Events, SalesReps cleared and reseeded' });
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/debug/ai', requireDebugSecret, async (_req, res) => {
  try {
    const { getAIProvider } = await import('./ai/aiFactory');
    const ai = getAIProvider();
    const result = await ai.chat([
      { role: 'user', content: 'Say hello in one word' },
    ]);
    res.json({ ok: true, provider: ai.name, response: result });
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.use('/api/book', bookTokenRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/booking', bookingRoutes);

app.use(errorHandler);

async function start(): Promise<void> {
  try {
    logger.info('Initializing Google Sheets...');
    await setupSheets();
    await seedDemoReps();

    // Run pending follow-ups every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        const { executePendingFollowUps } = await import('./services/followUpService');
        await executePendingFollowUps();
      } catch (err) {
        logger.error('[CRON] Follow-up job failed', { error: err });
      }
    });
    logger.info('Follow-up cron job scheduled (every 5 min)');

    const server = app.listen(config.port, () => {
      logger.info(`Server listening on port ${config.port} [${config.nodeEnv}]`);
      logger.info(`Health check: http://localhost:${config.port}/health`);
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      logger.error('Server failed to bind', { code: err.code, port: config.port, error: err.message });
      process.exit(1);
    });

    process.on('SIGTERM', () => {
      logger.info('[SHUTDOWN] SIGTERM received — closing server');
      server.close(() => {
        logger.info('[SHUTDOWN] All connections closed — exiting');
        process.exit(0);
      });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    logger.error('Failed to start server', { message: msg, stack, raw: JSON.stringify(err) });
    process.exit(1);
  }
}

start();
