import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { authRouter } from './routes/auth.js';
import { gameRouter } from './routes/game.js';
import { adminRouter } from './routes/admin.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { demoRouter } from './routes/demo.js';
import './db/index.js'; // ensures schema is created on boot
import { aiConfigured } from './engine/agentEngine.js';

const requiredEnv = ['JWT_SECRET', 'ADMIN_SECRET'];
for (const key of requiredEnv) {
  if (!process.env[key] || process.env[key].startsWith('change_me')) {
    console.warn(`[WARN] ${key} is unset or still the placeholder value — set a real secret before event day.`);
  }
}

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Global light rate limit as a baseline anti-abuse measure (spec section 23).
// State polling happens every 4 seconds, so 20 active browsers already produce
// about 300 requests/minute; keep this ceiling above normal event traffic while
// tighter, per-team limits protect action and chat routes.
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'agent-zero-backend', aiConfigured: aiConfigured() }));

app.use('/api/auth', authRouter);
app.use('/api/game', gameRouter);
app.use('/api/admin', adminRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/demo', demoRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`Agent Zero backend listening on http://localhost:${port}`);
  });
}

export default app;
