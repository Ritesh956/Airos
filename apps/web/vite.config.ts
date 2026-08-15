import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // MediaPipe's WASM runtime wants cross-origin isolation for best
    // performance (SharedArrayBuffer). Harmless if unused.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  build: {
    target: 'es2022',
    // Vite inlines any asset under 4KB as a base64 data: URI directly into
    // the referencing CSS by default — several of the self-hosted font
    // subsets (@fontsource/inter, @fontsource/jetbrains-mono ship one
    // @font-face per Unicode range, and the small ranges like Greek or
    // Vietnamese land under that threshold) were getting inlined this way.
    // That silently broke them: this app's CSP has no `font-src`
    // directive, so it falls back to `default-src 'self'` — which allows
    // same-origin file requests but not `data:` URIs — so every inlined
    // subset failed to load with a CSP violation in the console, found by
    // actually auditing the production build's console rather than
    // assuming a clean typecheck/build meant the fonts worked (the same
    // "npm run build passing isn't the same claim as it working"
    // discipline as CLAUDE.md's bug #14/#15). Forcing font files to always
    // emit as real hashed same-origin files sidesteps this rather than
    // widening the CSP to allow `data:` fonts app-wide.
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf)$/i.test(filePath) ? false : undefined),
    rollupOptions: {
      output: {
        // Three.js + React Three Fiber + Drei are only ever pulled in by
        // 3D Studio's lazy-loaded route (moduleRegistry.tsx), so this never
        // adds weight to the eagerly-loaded bundle — but bundled together
        // with StudioModule's own code, the whole ~900KB chunk (see the
        // build's own "chunks larger than 500kB" warning) was invalidated
        // by every rebuild, vendor libraries included, even when only this
        // app's own Studio code changed. Splitting the rarely-changing
        // vendor code into its own chunk means a repeat visitor who's
        // already cached it after an app update only re-downloads the
        // smaller, actually-changed piece. This doesn't shrink what a
        // *first-ever* /studio visit downloads — Lighthouse coverage for
        // that route specifically remains the open item flagged in
        // CLAUDE.md's audit notes (L14), not something a chunking change
        // can resolve on its own.
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('node_modules/@react-three')) {
            return 'three_vendor';
          }
        },
      },
    },
  },
});
