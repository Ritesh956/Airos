import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HealthResponse, ModelManifestEntry } from '@airos/shared';

// Mirrors apps/server/src/index.ts's MODEL_FILES — kept as a separate
// literal rather than a shared export since this function has no
// filesystem access to apps/web/dist (Vercel serverless functions and the
// static output are separate deployment artifacts), so "checked against
// the real file on disk" (the point of this endpoint, per
// packages/shared/src/protocol.ts's own doc comment) means an HTTP HEAD
// against this same deployment's static hosting instead of a stat() call.
const MODEL_FILES = ['hand_landmarker.task', 'face_landmarker.task', 'pose_landmarker.task'];

// A fresh Lambda instance per cold start, not the deployment's real
// lifetime — unlike apps/server's Express process, this number resets
// far more often than a reader used to that version's meaning would
// expect.
const startedAt = Date.now();

async function checkModel(origin: string, name: string): Promise<ModelManifestEntry> {
  try {
    const res = await fetch(`${origin}/models/${name}`, { method: 'HEAD' });
    if (!res.ok) return { name, present: false, sizeBytes: null };
    const contentLength = res.headers.get('content-length');
    return { name, present: true, sizeBytes: contentLength ? Number(contentLength) : null };
  } catch {
    return { name, present: false, sizeBytes: null };
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  const origin = `${proto}://${req.headers.host}`;

  const models = await Promise.all(MODEL_FILES.map((name) => checkModel(origin, name)));

  const body: HealthResponse = {
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    models,
  };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
