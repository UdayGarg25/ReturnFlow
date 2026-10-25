import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { getReadinessStatus } from './health/readiness.js';
import adminRoutes from './routes/admin.routes.js';
import demoRoutes from './routes/demo.routes.js';
import devAiTestRoutes from './routes/devAiTest.routes.js';
import { AI_TEST_ENABLED } from './services/aiTestScenario.service.js';
import invitationRoutes from './routes/invitation.routes.js';
import authRoutes from './routes/auth.routes.js';
import customerRoutes from './routes/customer.routes.js';
import pickupRoutes from './routes/pickup.routes.js';
import sellerRoutes from './routes/seller.routes.js';
import warehouseRoutes from './routes/warehouse.routes.js';
import productRoutes from './routes/product.routes.js';
import { apiLimiter } from './middleware/rateLimit.middleware.js';

const app = express();

if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY);
}

// Browser origins allowed to call the API WITH cookies. Credentialed requests can
// never use "*", so the origin must be listed explicitly (comma-separated in .env).
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.CORS_ORIGIN || (isProduction ? '' : 'http://localhost:5173'))
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    // Requests without an Origin header (curl, same-origin, server-to-server) are not browser cross-origin calls.
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser()); // fills req.cookies; must come before any route that authenticates

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/health/ready', async (req, res) => {
  const readiness = await getReadinessStatus();
  res.status(readiness.httpStatus).json(readiness.body);
});

// Global rate limiting for API routes (health checks are mounted above and exempt)
app.use('/api', apiLimiter);

// Public: only the auth endpoints. Every other /api router below starts with
// authenticate + authorize(<role>) (see its routes file).
app.use('/api/auth', authRoutes);
app.use('/api/invitations', invitationRoutes); // public, token-based
app.use('/api/admin', adminRoutes);
if (AI_TEST_ENABLED) app.use('/api/dev/ai-test', devAiTestRoutes); // development-only AI test scenario; never in production
app.use('/api/demo', demoRoutes); // public demo helpers, restricted to the fixed demo accounts (see demo.service.js)
app.use('/api/products', productRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/pickups', pickupRoutes);
app.use('/api/warehouse', warehouseRoutes);
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

// Last resort for anything a route did not handle. The real error is logged here
// on the server; the client only ever sees a generic message (no stack, no SQL).
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' });
  console.error(err);
  return res.status(500).json({ message: 'Internal server error' });
});

export default app;
