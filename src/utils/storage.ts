/**
 * IndexedDB-backed storage for large generated assets (voiceover audio).
 * This is kept out of localStorage, which has a small size limit (typically
 * ~5MB) that base64-encoded media would quickly exceed.
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

/** Saves a blob under the given key, overwriting any existing entry. */
export async function saveAsset(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
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

/** Deletes a saved asset, if it exists. */
export async function deleteAsset(key: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Deletes every saved asset. Used by the "Clear Saved Data" setting. */
export async function clearAllAssets(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const assetKeys = {
  audio: (queueItemId: string) => `audio:${queueItemId}`,
  video: (queueItemId: string) => `video:${queueItemId}`,
};

/** Fetches a `data:`/`blob:` URL and returns its contents as a `Blob`. */
export async function urlToBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  return response.blob();
}
