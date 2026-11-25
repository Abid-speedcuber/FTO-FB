export const SHARED_POINTER_SETTINGS_KEY = 'master-fto-settings-v1';
export const SHARED_SOLVE_KEY = 'master-fto-v1';
export const SHARED_JOURNAL_PREFIX = 'master-fto-journal-v2:';

const validMode = (mode) => mode === 'swipe' || mode === 'legacy';
function readJSON(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null'); }
  catch { return null; }
}

// Read the simulator's existing database without creating, upgrading, or
// writing it. Gesture mode lives with solve metadata, not keyboard profiles.
function readStoredMode(database) {
  if (!database) return Promise.resolve(null);
  return new Promise((resolve) => {
    let request;
    try { request = database.open('master-fto-solves-v2'); }
    catch { resolve(null); return; }
    request.onupgradeneeded = () => { request.transaction.abort(); };
    request.onerror = request.onblocked = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('meta')) { db.close(); resolve(null); return; }
      try {
        const transaction = db.transaction('meta', 'readonly');
        const root = transaction.objectStore('meta').get('root');
        root.onsuccess = () => resolve(root.result?.pointerMode ?? null);
        root.onerror = () => resolve(null);
        transaction.oncomplete = transaction.onabort = () => db.close();
      } catch { db.close(); resolve(null); }
    };
  });
}

export async function readTrainerPointerSettings({ storage = localStorage, database = globalThis.indexedDB, pointerMode } = {}) {
  const preferences = readJSON(storage, SHARED_POINTER_SETTINGS_KEY) ?? {};
  const storedMode = validMode(pointerMode) ? pointerMode : await readStoredMode(database);
  const legacyMode = readJSON(storage, SHARED_SOLVE_KEY)?.pointerMode;
  const bias = (key) => Number.isFinite(preferences[key]) ? Math.max(0, Math.min(100, preferences[key])) / 100 : 0.6;
  return { mode: validMode(storedMode) ? storedMode : validMode(legacyMode) ? legacyMode : 'swipe',
    outerBias: bias('outerTurnBias'), upBias: bias('uTurnBias'), eifUpBias: bias('eifUTurnBias') };
}
