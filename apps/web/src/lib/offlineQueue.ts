export type OfflineRecordType = 'FIELD_VISIT';

export interface OfflineRecord<T = unknown> {
  id: string;
  type: OfflineRecordType;
  payload: T;
  createdAt: string;
}

const DATABASE_NAME = 'tribalconnect-offline';
const STORE_NAME = 'pending-records';
const FALLBACK_KEY = 'tribalconnect:pending-records';

const supportsIndexedDb = () => typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open the offline queue.'));
  });
}

function fallbackRecords(): OfflineRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FALLBACK_KEY);
    const records = raw ? JSON.parse(raw) : [];
    return Array.isArray(records) ? records as OfflineRecord[] : [];
  } catch {
    return [];
  }
}

function saveFallback(records: OfflineRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(records));
  } catch {
    // The active page can still submit when it is online even if local persistence is unavailable.
  }
}

export async function enqueueOfflineRecord<T>(type: OfflineRecordType, payload: T): Promise<OfflineRecord<T>> {
  const record: OfflineRecord<T> = { id: createId(), type, payload, createdAt: new Date().toISOString() };
  if (!supportsIndexedDb()) {
    saveFallback([...fallbackRecords(), record]);
    return record;
  }
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to queue the record.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Unable to queue the record.'));
    }).finally(() => database.close());
  } catch {
    // Some privacy modes expose IndexedDB but deny writes; retain a best-effort browser fallback.
    saveFallback([...fallbackRecords(), record]);
  }
  return record;
}

export async function listOfflineRecords(): Promise<OfflineRecord[]> {
  if (!supportsIndexedDb()) return fallbackRecords();
  try {
    const database = await openDatabase();
    return await new Promise<OfflineRecord[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as OfflineRecord[]).sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
      request.onerror = () => reject(request.error ?? new Error('Unable to read queued records.'));
    }).finally(() => database.close());
  } catch {
    return fallbackRecords();
  }
}

export async function removeOfflineRecord(id: string) {
  if (!supportsIndexedDb()) {
    saveFallback(fallbackRecords().filter((record) => record.id !== id));
    return;
  }
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to remove the queued record.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Unable to remove the queued record.'));
    }).finally(() => database.close());
  } catch {
    saveFallback(fallbackRecords().filter((record) => record.id !== id));
  }
}
