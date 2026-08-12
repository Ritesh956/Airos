import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { HealthResponse } from '@airos/shared';
import { attachWebSocketRelay } from './ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT ?? 8787);
const startedAt = Date.now();

app.use(express.json({ limit: '32kb' })); // small on purpose — no frames ever land here

app.get('/api/health', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  };
  res.json(body);
});

// Serve the built client in production. In development, Vite's own dev
// server handles the web app and this route simply won't be hit.
const clientDist = path.resolve(__dirname, '../../web/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

const httpServer = createServer(app);
attachWebSocketRelay(httpServer);

httpServer.listen(PORT, () => {
  console.log(`[airos-server] listening on http://localhost:${PORT}`);
  console.log('[airos-server] this process never receives camera frames or images.');
});
