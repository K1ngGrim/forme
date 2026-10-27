/** Minimal promise wrapper around IndexedDB (no dependency). */

const DB_NAME = 'forme';
const DB_VERSION = 1;

export const STORES = { projects: 'projects', files: 'files', folders: 'folders' } as const;
type StoreName = (typeof STORES)[keyof typeof STORES];

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.projects)) db.createObjectStore(STORES.projects, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.files)) db.createObjectStore(STORES.files);
      if (!db.objectStoreNames.contains(STORES.folders)) db.createObjectStore(STORES.folders, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB nicht verfügbar'));
  });
  return opening;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB-Fehler'));
  });
}

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return done(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function idbGetAll<T>(store: StoreName, range?: IDBKeyRange): Promise<T[]> {
  const db = await openDb();
  return done(db.transaction(store).objectStore(store).getAll(range)) as Promise<T[]>;
}

export async function idbKeys(store: StoreName, range?: IDBKeyRange): Promise<IDBValidKey[]> {
  const db = await openDb();
  return done(db.transaction(store).objectStore(store).getAllKeys(range));
}

export async function idbPut(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openDb();
  await done(db.transaction(store, 'readwrite').objectStore(store).put(value, key));
}

export async function idbDelete(store: StoreName, key: IDBValidKey | IDBKeyRange): Promise<void> {
  const db = await openDb();
  await done(db.transaction(store, 'readwrite').objectStore(store).delete(key));
}
