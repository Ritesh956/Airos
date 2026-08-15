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

// Omits the framework fingerprint from every response — a low-cost
// hardening step, not a meaningful secret (CLAUDE.md UI/UX audit finding #22).
app.disable('x-powered-by');

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
  // Tells the browser (and anything reading this response) that AIR OS
  // only ever wants camera/microphone for itself, and never wants
  // geolocation at all — makes the app's own actual permission usage
  // explicit rather than implicit (CLAUDE.md UI/UX audit finding #22).
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  // Browsers ignore this header entirely over a plain HTTP connection, so
  // sending it unconditionally is safe even in local/HTTP dev — it only
  // takes effect once this response is actually served over HTTPS (CLAUDE.md
  // UI/UX audit finding #22).
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self'",
      // React/Three.js only ever write inline styles through the CSSOM
      // (`el.style.x = ...`), which CSP doesn't govern — but a bare
      // `style-src 'self'` also silently blocks `setAttribute('style', …)`
      // with no error, which would be a real trap for the next dependency
      // or snippet that sets one that way. `style-src-attr` is narrower
      // than opening up `style-src` itself (CLAUDE.md UI/UX audit finding
      // #21).
      "style-src-attr 'unsafe-inline'",
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

// `index.html` itself must stay revalidate-on-every-load (it names the
// current content-hashed bundle, so caching it would pin visitors to a
// stale build) — everything else served from dist/, including the
// content-hashed JS/CSS bundles and the three MediaPipe model files, is
// either hashed or effectively version-locked by filename, so a year-long
// immutable cache is safe. Previously every static response — including
// the ~7.8MB hand-tracking model — carried `express.static`'s default
// `max-age=0`, forcing a full revalidation request on every single visit
// for assets that never actually change (CLAUDE.md UI/UX audit finding #08).
app.use(
  express.static(clientDist, {
    index: false,
    setHeaders: (res, filePath) => {
      if (!filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);
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
