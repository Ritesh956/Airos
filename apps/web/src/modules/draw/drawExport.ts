/**
 * PNG export for Air Draw. `HTMLCanvasElement.toBlob` (not `toDataURL`) is
 * used throughout: it's async and non-blocking, and produces a real `Blob`
 * that's what both a download link and IndexedDB (`drawGallery.ts`) want
 * directly, rather than a base64 string that would need re-decoding for
 * the gallery's storage.
 */

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas export produced no blob — the canvas may be tainted or zero-sized.'));
    }, 'image/png');
  });
}

/** Triggers a real browser download of the canvas as a PNG file — the
 *  `<a download>` + object-URL pattern is the standard client-side export
 *  mechanism; no server round-trip, no camera frame or drawing data ever
 *  leaves the device (consistent with every other module's privacy stance). */
export async function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename?: string): Promise<void> {
  const blob = await canvasToPngBlob(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename ?? `air-draw-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
