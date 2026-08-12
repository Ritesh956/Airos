#!/usr/bin/env node
/**
 * Vendors the MediaPipe WASM runtime and model files into public/models/ so
 * the app can be self-hosted and doesn't depend on a third-party CDN at
 * runtime — IMPLEMENTATION.md's "Model hosting" decision.
 *
 * These are large binaries (the WASM runtime alone is ~30MB across its
 * three variants) and change rarely, so they're fetched here rather than
 * committed to git. This runs automatically via `postinstall`; run it
 * manually with `npm run models:fetch` if public/models/ ever gets wiped.
 */
import { existsSync, mkdirSync, copyFileSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const modelsDir = path.join(webRoot, 'public', 'models');
const wasmDestDir = path.join(modelsDir, 'wasm');

// The exact set of wasm runtime files @mediapipe/tasks-vision exposes as
// package subpath exports (see its package.json "exports" map) — SIMD and
// non-SIMD variants, in both classic and ES-module-worker form. Resolved
// through Node's own resolver rather than a hardcoded node_modules path,
// since npm workspaces hoist this package to the repo-root node_modules
// rather than apps/web/node_modules.
const WASM_SUBPATHS = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
];

const MODELS = [
  {
    // Hand Landmarker — Phase 2. Pose model is added in Phase 10.
    name: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
  },
  {
    // Face Landmarker — Phase 9. Same bucket layout as hand_landmarker.
    name: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
  },
];

function copyWasmRuntime() {
  mkdirSync(wasmDestDir, { recursive: true });
  let copied = 0;
  for (const subpath of WASM_SUBPATHS) {
    const resolvedUrl = import.meta.resolve(`@mediapipe/tasks-vision/${subpath}`);
    copyFileSync(fileURLToPath(resolvedUrl), path.join(wasmDestDir, subpath));
    copied += 1;
  }
  console.log(`[fetch-models] Copied ${copied} WASM runtime files to public/models/wasm/`);
}

async function downloadModel(model) {
  const dest = path.join(modelsDir, model.name);
  if (existsSync(dest)) {
    console.log(`[fetch-models] ${model.name} already present, skipping download.`);
    return;
  }
  console.log(`[fetch-models] Downloading ${model.name}...`);
  const response = await fetch(model.url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${model.url}: HTTP ${response.status}`);
  }
  mkdirSync(modelsDir, { recursive: true });
  await pipeline(response.body, createWriteStream(dest));
  console.log(`[fetch-models] Saved ${model.name}`);
}

async function main() {
  copyWasmRuntime();
  for (const model of MODELS) {
    await downloadModel(model);
  }
}

main().catch((error) => {
  console.error('[fetch-models] Failed:', error.message);
  console.error(
    '[fetch-models] The app will still run, but tracking features that need this model will show a "model load failed" error until this succeeds.',
  );
  // Non-fatal: don't block `npm install` on a network hiccup. The camera
  // error taxonomy (vision/camera/errors.ts) surfaces this at runtime.
});
