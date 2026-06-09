import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { pool } from './db/pool';
import { logger } from './utils/logger';

// Routes
import authRoutes       from './routes/auth';
import subscriberRoutes from './routes/subscribers';
import billingRoutes    from './routes/billing';
import networkRoutes    from './routes/network';
import nasRoutes        from './routes/nas';
import rechargeRoutes   from './routes/recharge';
import whatsappRoutes   from './routes/whatsapp';
import agentRoutes      from './routes/agents';
import ticketRoutes     from './routes/tickets';
import inventoryRoutes  from './routes/inventory';
import outageRoutes     from './routes/outages';
import approvalRoutes   from './routes/approvals';
import expenseRoutes    from './routes/expenses';
import { initWhatsApp } from './services/whatsapp.service';

// Jobs
import { startExpiryReminderCron } from './jobs/expiry-reminder.cron';
import { startExpiryBatchCron }    from './jobs/expiry-batch.cron';

const app = express();
const PORT = parseInt(process.env.API_PORT || '4000', 10);

function validateEnvironment(): void {
  const requiredVars = ['DATABASE_URL', 'JWT_SECRET', 'AES_KEY'];
  const missing = requiredVars.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if ((process.env.JWT_SECRET || '').length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  if ((process.env.AES_KEY || '').length < 32) {
    logger.warn('AES_KEY is shorter than recommended 32 characters; encryption operations may fail for some values');
  }
}

// =============================================================================
//  SECURITY MIDDLEWARE
// =============================================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// Rate limiting — 200 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 5000 : 1200,
  skip: (req) => {
    // Real-time telemetry/status endpoints can be polled frequently by the dashboard.
    if (req.method !== 'GET') return false;
    const p = req.path;
    return /^\/nas\/\d+\/live-stats$/.test(p)
      || p === '/health'
      || p === '/whatsapp/status';
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});
app.use('/api', limiter);

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 100 : 10,
  message: { error: 'Too many login attempts.' },
});
app.use('/api/auth/login', authLimiter);

// CORS — allow only trusted origins
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  process.env.VITE_API_BASE_URL || 'http://localhost:5173',
  'http://localhost:3001',
  'https://localhost',
  'http://localhost:4885',
  'http://10.55.44.102:4885',
  `http://${process.env.VPS_IP || '10.55.44.102'}:4885`,
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// =============================================================================
//  GENERAL MIDDLEWARE
// =============================================================================
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', {
  stream: { write: (message) => logger.http(message.trim()) },
}));

// =============================================================================
//  ROUTES
// =============================================================================
app.use('/api/auth',        authRoutes);
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/billing',     billingRoutes);
app.use('/api/network',     networkRoutes);
app.use('/api/nas',         nasRoutes);
app.use('/api/recharge',    rechargeRoutes);
app.use('/api/whatsapp',    whatsappRoutes);
app.use('/api/agents',      agentRoutes);
app.use('/api/tickets',     ticketRoutes);
app.use('/api/inventory',   inventoryRoutes);
app.use('/api/outages',     outageRoutes);
app.use('/api/approvals',   approvalRoutes);
app.use('/api/expenses',    expenseRoutes);

// =============================================================================
//  HEALTH CHECK
// =============================================================================
app.get('/api/health', async (_req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW() as time, version() as pg_version');
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        server_time: dbResult.rows[0].time,
        version: dbResult.rows[0].pg_version.split(' ')[0] + ' ' + dbResult.rows[0].pg_version.split(' ')[1],
      },
      uptime_seconds: Math.floor(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      node_version: process.version,
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: String(err) });
  }
});

// =============================================================================
//  ERROR HANDLER
// =============================================================================
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((_req: express.Request, res: express.Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// =============================================================================
//  STARTUP
// =============================================================================
async function main() {
  // Validate critical environment configuration first
  try {
    validateEnvironment();
    logger.info('✅ Environment validation passed');
  } catch (err) {
    logger.error('❌ Environment validation failed:', err);
    process.exit(1);
  }

  // Verify DB connection
  try {
    await pool.query('SELECT 1');
    logger.info('✅ Database connection established');
  } catch (err) {
    logger.error('❌ Database connection failed:', err);
    process.exit(1);
  }

  // Start background cron jobs
  startExpiryReminderCron();
  startExpiryBatchCron();
  logger.info('✅ Background cron jobs started');

  // Start WhatsApp service in background (QR/session lifecycle)
  initWhatsApp().catch((err) => {
    logger.error('❌ WhatsApp service initialization failed:', err);
  });

  // Start server
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 ISP-CRM Backend API running on port ${PORT}`);
    logger.info(`   Environment : ${process.env.NODE_ENV}`);
    logger.info(`   Health check: http://localhost:${PORT}/api/health`);
  });
}

main().catch((err) => {
  logger.error('Fatal startup error:', err);
  process.exit(1);
});

export default app;
