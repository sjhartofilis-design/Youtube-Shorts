/**
 * Legacy IndexedDB reader, used only to migrate previously-generated
 * voiceover audio and uploaded final videos into Supabase Storage the first
 * time this app loads with an account.
 */

const DB_NAME = 'shorts-automator';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Loads a previously saved blob, or `undefined` if none was found. */
export async function loadAsset(key: string): Promise<Blob | undefined> {
  const db = await openDb();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const legacyAssetKeys = {
  audio: (queueItemId: string) => `audio:${queueItemId}`,
  video: (queueItemId: string) => `video:${queueItemId}`,
};

/** Fetches a `data:`/`blob:` URL and returns its contents as a `Blob`. */
export async function urlToBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  return response.blob();
}
