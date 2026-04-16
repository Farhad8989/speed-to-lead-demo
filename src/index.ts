import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

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

    app.listen(config.port, () => {
      logger.info(`Server listening on port ${config.port} [${config.nodeEnv}]`);
      logger.info(`Health check: http://localhost:${config.port}/health`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err });
    process.exit(1);
  }
}

start();
