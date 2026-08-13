import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';
import express from 'express';
import compression from 'compression';
import type { HealthResponse, ModelManifestEntry } from '@airos/shared';
import { attachWebSocketRelay } from './ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT ?? 8787);
const startedAt = Date.now();

// gzip/brotli the client bundle, the MediaPipe WASM runtime, and the .task
// model files — without this every one of those (multi-megabyte) responses
// goes over the wire uncompressed. Lighthouse's "Enable text compression"
// audit is what caught this; see IMPLEMENTATION.md §11 Phase 14's gate.
app.use(compression());

/**
 * Security headers, applied to every response. Matches (and makes real in
 * production) the same COOP/COEP pair `apps/web/vite.config.ts` already
 * sets for the *dev* server — MediaPipe's WASM runtime wants cross-origin
 * isolation (SharedArrayBuffer) for its best-performing code path, and
 * before this, production simply never sent these headers at all, so
 * every real deployment silently ran a different, slower code path than
 * whatever was measured in development. `credentialless` (not
 * `require-corp`) matches the dev config's own choice, so a same-origin
 * app with no cross-origin subresources needs no further CORP headers on
 * individual assets.
 *
 * The rest are standard, low-risk hardening that cost nothing here:
 * `X-Content-Type-Options` stops MIME-sniffing a served asset into
 * something it isn't; `Referrer-Policy` avoids leaking full URLs (which
 * could include route state) to third parties on outbound links; the CSP
 * is scoped to what this app actually needs — `wasm-unsafe-eval` for
 * MediaPipe's WebAssembly, `blob:`/`data:` for the PNG export
 * (`drawExport.ts`) and gallery object URLs (`drawGallery.ts`), and
 * `frame-ancestors 'none'` since nothing about this app benefits from
 * being embeddable in someone else's page.
 */
app.use((_req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  next();
});

app.use(express.json({ limit: '32kb' })); // small on purpose — no frames ever land here

// Serve the built client in production. In development, Vite's own dev
// server handles the web app and this route simply won't be hit.
const clientDist = path.resolve(__dirname, '../../web/dist');

// The same model list scripts/fetch-models.mjs (apps/web) vendors into
// public/models/, checked here against the real built dist/ once at
// startup — "model manifest" per IMPLEMENTATION.md §10 means what's
// actually present in *this* build, not a hardcoded assumption. Model
// files don't change while the process is running, so this is computed
// once rather than stat'd on every /api/health request.
const MODEL_FILES = ['hand_landmarker.task', 'face_landmarker.task', 'pose_landmarker.task'];

function buildModelManifest(): ModelManifestEntry[] {
  return MODEL_FILES.map((name) => {
    try {
      const stats = statSync(path.join(clientDist, 'models', name));
      return { name, present: true, sizeBytes: stats.size };
    } catch {
      return { name, present: false, sizeBytes: null };
    }
  });
}

const modelManifest = buildModelManifest();

app.get('/api/health', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    models: modelManifest,
  };
  res.json(body);
});

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
