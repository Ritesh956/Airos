/**
 * Air Draw's local gallery — raw `indexedDB`, no wrapper library. The
 * gallery only ever needs three operations (save, list, delete) on one
 * object store, which is little enough that a dependency (`idb`, etc.)
 * wasn't worth adding for a project whose whole thesis is "look at what's
 * actually necessary" (see IMPLEMENTATION.md §1.7's reasoning for the same
 * call on the state stores). Every drawing is a raster PNG `Blob`
 * (IndexedDB stores Blobs natively, no base64 encoding needed) plus a
 * timestamp — this is a snapshot gallery, not a re-editable stroke session
 * store, matching the placeholder's brief: "save to a local gallery... and
 * export as PNG," not "resume an old drawing."
 */

const DB_NAME = 'airos-draw-gallery';
const DB_VERSION = 1;
const STORE_NAME = 'drawings';

export interface GalleryEntry {
  id: number;
  createdAt: number;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open the draw gallery database.'));
  });
}

export async function saveDrawing(blob: Blob): Promise<number> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const request = tx.objectStore(STORE_NAME).add({ createdAt: Date.now(), blob });
      // Resolved on tx.oncomplete, not request.onsuccess — matching
      // deleteDrawing's already-correct pattern below. request.onsuccess
      // only means the individual write was *accepted into* the
      // transaction, not that the transaction itself committed; a later
      // abort (quota exceeded, a version-change collision) after that
      // point used to be silently invisible to the caller, which reported
      // the drawing as saved when it hadn't actually persisted.
      let insertedId: number | undefined;
      request.onsuccess = () => {
        insertedId = request.result as number;
      };
      request.onerror = () => reject(request.error ?? new Error('Failed to save the drawing.'));
      tx.oncomplete = () => resolve(insertedId!);
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save the drawing.'));
    });
  } finally {
    db.close();
  }
}

export async function listDrawings(): Promise<GalleryEntry[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const entries = request.result as GalleryEntry[];
        // Newest first — a gallery reads naturally as "most recent work up top."
        resolve(entries.sort((a, b) => b.createdAt - a.createdAt));
      };
      request.onerror = () => reject(request.error ?? new Error('Failed to list drawings.'));
    });
  } finally {
    db.close();
  }
}

export async function deleteDrawing(id: number): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to delete the drawing.'));
    });
  } finally {
    db.close();
  }
}

/** Empties the whole gallery in one transaction — the counterpart Settings'
 *  "Clear all local data" needs (CLAUDE.md UI/UX audit finding #19): the
 *  gallery previously only had per-item delete, with no single control to
 *  clear everything this app has ever stored on the visitor's device. */
export async function clearAllDrawings(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear the gallery.'));
    });
  } finally {
    db.close();
  }
}
