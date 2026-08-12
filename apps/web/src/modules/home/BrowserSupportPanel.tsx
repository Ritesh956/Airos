import { useMemo } from 'react';
import { Panel } from '@/ui/Panel';
import { checkBrowserSupport } from '@/utils/browserSupport';
import { cn } from '@/utils/cn';

function SupportRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-ink-2">{label}</span>
      <span
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium',
          ok ? 'text-success-500' : 'text-danger-500',
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-success-500' : 'bg-danger-500')} />
        {ok ? 'Supported' : 'Unavailable'}
      </span>
    </div>
  );
}

/** Reports what this browser can actually do — measured via feature
 *  detection, not assumed. See IMPLEMENTATION.md §6 error taxonomy. */
export function BrowserSupportPanel() {
  const support = useMemo(() => checkBrowserSupport(), []);

  return (
    <Panel eyebrow="Environment" title="Browser capabilities">
      <SupportRow label="Secure context (HTTPS/localhost)" ok={support.secureContext} />
      <SupportRow label="Camera access (getUserMedia)" ok={support.mediaDevices} />
      <SupportRow label="WebGL2 (3D rendering + GPU inference)" ok={support.webgl2} />
      <SupportRow label="WebAssembly (CPU inference fallback)" ok={support.wasm} />
      <SupportRow label="Speech recognition (voice commands)" ok={support.speechRecognition} />
      {!support.fullySupported && (
        <p className="mt-3 rounded-lg border border-warning-500/30 bg-warning-500/10 p-3 text-xs text-warning-500">
          Some core features are unavailable in this browser. AIR OS is built for and tested
          against recent Chromium-based browsers (Chrome, Edge).
        </p>
      )}
    </Panel>
  );
}
