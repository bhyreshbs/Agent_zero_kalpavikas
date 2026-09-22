import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { authRouter }        from './routes/auth.js';
import { gameRouter }        from './routes/game.js';
import { adminRouter }       from './routes/admin.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { demoRouter }        from './routes/demo.js';
import { initializeDatabase } from './db/index.js';
import { aiConfigured }       from './engine/agentEngine.js';

// Validate required secrets at startup
const requiredEnv = ['ADMIN_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL'];
for (const key of requiredEnv) {
  if (!process.env[key] || process.env[key].startsWith('change_me') || process.env[key].startsWith('your-')) {
    console.warn(`[WARN] ${key} is unset or still a placeholder — set a real value before the event.`);
  }
}

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Vercel) for rate limiting IP extraction
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Global rate limit — same ceiling as before (2000 req/min across all IPs)
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (req, res) =>
  res.json({ ok: true, name: 'agent-zero-backend', aiConfigured: aiConfigured() })
);

app.use('/api/auth',        authRouter);
app.use('/api/game',        gameRouter);
app.use('/api/admin',       adminRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/demo',        demoRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Initialize DB (seed admin_config defaults) then start listening
async function start() {
  try {
    await initializeDatabase();
  } catch (err) {
    console.error('[startup] Database initialization failed:', err.message);
    console.error('Check DATABASE_URL and Supabase connection.');
    process.exit(1);
  }

  if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 4000;
    app.listen(port, () => {
      console.log(`Agent Zero backend listening on http://localhost:${port}`);
    });
  }
}

start();

export default app;
