const DB_NAME = "buildproof-offline-db";
const DB_VERSION = 2;
const STORE_NAME = "offline-projects";

export type OfflineProjectRecord = {
  id: string; // offline id (offline-xxxx)
  name: string;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  projectAddress: string | null;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "syncing" | "synced";
  syncAttemptCount: number;
  lastSyncAttemptAt: string | null;
  lastError: string | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createOfflineProjectId() {
  return `offline-project-${crypto.randomUUID()}`;
}

export async function putOfflineProject(
  record: OfflineProjectRecord
): Promise<void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.put(record);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllOfflineProjects(): Promise<OfflineProjectRecord[]> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const req = store.getAll();

    req.onsuccess = () => resolve(req.result as OfflineProjectRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removeOfflineProject(id: string): Promise<void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateOfflineProject(
  id: string,
  updates: Partial<OfflineProjectRecord>
): Promise<void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result as OfflineProjectRecord | undefined;
      if (!existing) {
        resolve();
        return;
      }

      store.put({
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    };

    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function claimOfflineProject(
  id: string
): Promise<OfflineProjectRecord | null> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result as OfflineProjectRecord | undefined;

      if (!existing || existing.status !== "pending") {
        resolve(null);
        return;
      }

      const updated: OfflineProjectRecord = {
        ...existing,
        status: "syncing",
        updatedAt: new Date().toISOString(),
      };

      store.put(updated);
      resolve(updated);
    };

    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}