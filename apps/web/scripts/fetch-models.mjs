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
import { existsSync, mkdirSync, copyFileSync, createWriteStream, renameSync, rmSync } from 'node:fs';
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
    // Hand Landmarker — Phase 2.
    name: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
  },
  {
    // Face Landmarker — Phase 9. Same bucket layout as hand_landmarker.
    name: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
  },
  {
    // Pose Landmarker — Phase 10. Unlike hand/face, this task ships three
    // size variants (lite/full/heavy); `lite` is used here — see
    // PoseLandmarkerService.ts's doc comment for why (this is the third
    // MediaPipe task run in the same frame, and the performance budget in
    // IMPLEMENTATION.md §9 has no headroom to spend on accuracy beyond what
    // the joint-angle readouts actually need).
    name: 'pose_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  },
];

function copyWasmRuntime() {
  mkdirSync(wasmDestDir, { recursive: true });
  let copied = 0;
  let skipped = 0;
  for (const subpath of WASM_SUBPATHS) {
    const dest = path.join(wasmDestDir, subpath);
    // These files are ~30MB combined and never change without a
    // @mediapipe/tasks-vision version bump — re-copying all of them on
    // every `npm install` (this runs via `postinstall`) was pure waste
    // once they're already in place.
    if (existsSync(dest)) {
      skipped += 1;
      continue;
    }
    const resolvedUrl = import.meta.resolve(`@mediapipe/tasks-vision/${subpath}`);
    copyFileSync(fileURLToPath(resolvedUrl), dest);
    copied += 1;
  }
  console.log(`[fetch-models] Copied ${copied} WASM runtime files to public/models/wasm/ (${skipped} already present).`);
}

async function downloadModel(model) {
  const dest = path.join(modelsDir, model.name);
  if (existsSync(dest)) {
    console.log(`[fetch-models] ${model.name} already present, skipping download.`);
    return;
  }
  console.log(`[fetch-models] Downloading ${model.name}...`);
  mkdirSync(modelsDir, { recursive: true });

  // Downloaded to a `.partial` sibling and renamed into place only once the
  // full stream has landed on disk — writing straight to `dest` meant a
  // network failure mid-download (a dropped connection, a killed process)
  // left a truncated .task file sitting at the real path. The existsSync()
  // guard above then treated that truncated file as "already present"
  // forever, on every future `npm install` *and* a manual `npm run
  // models:fetch` — the exact command this file's own error handler below
  // recommends running to recover, which would silently do nothing. The
  // only visible symptom was a landmarker failing to load at runtime with
  // no obvious link back to this script.
  const partialDest = `${dest}.partial`;
  try {
    const response = await fetch(model.url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download ${model.url}: HTTP ${response.status}`);
    }
    await pipeline(response.body, createWriteStream(partialDest));
    renameSync(partialDest, dest);
    console.log(`[fetch-models] Saved ${model.name}`);
  } catch (error) {
    if (existsSync(partialDest)) rmSync(partialDest, { force: true });
    throw error;
  }
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
