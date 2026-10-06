/**
 * Copie locale des brouillons (IndexedDB) : rien n'est perdu en cas de coupure
 * réseau, de fermeture ou de rafraîchissement ; la copie est renvoyée au serveur
 * dès le retour du réseau.
 */
const DB_NAME = "culinova";
const STORE = "drafts";

export interface LocalDraft {
  draftId: string;
  state: unknown;
  clientUpdatedAt: string;
  /** false tant que cette version n'a pas été acceptée par le serveur. */
  synced: boolean;
}

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "draftId" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function readLocalDraft(draftId: string): Promise<LocalDraft | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(draftId);
    request.onsuccess = () => resolve((request.result as LocalDraft | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

export async function writeLocalDraft(draft: LocalDraft): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
