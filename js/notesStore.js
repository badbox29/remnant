/**
 * notesStore.js — IndexedDB wrapper for note content and the scratchpad
 *
 * Note bodies and the scratchpad live here, not in localStorage, so a long
 * history of writing never approaches localStorage's ~5MB per-origin ceiling.
 * IndexedDB's quota is disk-proportional and effectively unbounded for text.
 *
 * Two object stores in one database:
 *   notes       — keyed by note id, one record per note
 *   scratchpad  — single fixed key ('main'); there is only ever one scratchpad
 *
 * localStorage still holds small account/tab metadata (see app.js — tabState,
 * authMethod, userToken, etc.) via Auth's own store helper. This module only
 * ever touches note/scratchpad *content*.
 *
 * API (all async):
 *   NotesStore.get(id)                → note | null
 *   NotesStore.set(id, note)          → void
 *   NotesStore.delete(id)             → void
 *   NotesStore.getAll()               → { [id]: note }   — used by pushToWorker
 *   NotesStore.replaceAll(notesObj)   → void              — used by pullFromWorker
 *   NotesStore.getScratchpad()        → { content, updatedAt } | null
 *   NotesStore.setScratchpad(content) → void
 *   NotesStore.clear()                → void  — wipes notes AND scratchpad
 *
 * Note shape: { id, title, content, createdAt, updatedAt }
 */
const NotesStore = (() => {
  const DB_NAME           = 'remnant-notes';
  const NOTES_STORE       = 'notes';
  const SCRATCHPAD_STORE  = 'scratchpad';
  const SCRATCHPAD_KEY    = 'main';
  const DB_VERSION        = 1;

  let _db = null;

  function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(NOTES_STORE))      db.createObjectStore(NOTES_STORE);
        if (!db.objectStoreNames.contains(SCRATCHPAD_STORE)) db.createObjectStore(SCRATCHPAD_STORE);
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function store(name, mode) {
    const db = await openDB();
    return db.transaction(name, mode).objectStore(name);
  }

  function wrap(req) {
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = (e) => { console.warn('[NotesStore]', e.target.error); resolve(null); };
    });
  }

  // ── Individual notes ──────────────────────────────────────────────

  async function get(id) {
    try { return await wrap((await store(NOTES_STORE, 'readonly')).get(id)); }
    catch { return null; }
  }

  async function set(id, note) {
    if (!id || !note) return;
    try { await wrap((await store(NOTES_STORE, 'readwrite')).put(note, id)); }
    catch (e) { console.warn('[NotesStore] set failed:', e); }
  }

  async function del(id) {
    try { await wrap((await store(NOTES_STORE, 'readwrite')).delete(id)); }
    catch { /* ignore */ }
  }

  // ── Bulk operations (sync with worker) ────────────────────────────

  // getAll() — returns every note as { [id]: note }, the shape pushToWorker
  // assembles into the KV wire-format blob.
  async function getAll() {
    try {
      const s = await store(NOTES_STORE, 'readonly');
      const keysReq = s.getAllKeys();
      const valsReq = s.getAll();
      const [keys, vals] = await Promise.all([wrap(keysReq), wrap(valsReq)]);
      const out = {};
      (keys || []).forEach((k, i) => { out[k] = (vals || [])[i]; });
      return out;
    } catch (e) {
      console.warn('[NotesStore] getAll failed:', e);
      return {};
    }
  }

  // replaceAll(notesObj) — wipes the notes store and rehydrates from a pulled
  // KV blob. Used after a successful pullFromWorker so local IndexedDB matches
  // the server's copy exactly (no stale notes left behind after a delete on
  // another device, for example).
  async function replaceAll(notesObj) {
    try {
      const s = await store(NOTES_STORE, 'readwrite');
      await wrap(s.clear());
      const entries = Object.entries(notesObj || {});
      await Promise.all(entries.map(([id, note]) => wrap(s.put(note, id))));
    } catch (e) {
      console.warn('[NotesStore] replaceAll failed:', e);
    }
  }

  // ── Scratchpad (separate store — never appears in the notes collection) ──

  async function getScratchpad() {
    try { return await wrap((await store(SCRATCHPAD_STORE, 'readonly')).get(SCRATCHPAD_KEY)); }
    catch { return null; }
  }

  async function setScratchpad(content) {
    try {
      const record = { content: content || '', updatedAt: Date.now() };
      await wrap((await store(SCRATCHPAD_STORE, 'readwrite')).put(record, SCRATCHPAD_KEY));
    } catch (e) { console.warn('[NotesStore] setScratchpad failed:', e); }
  }

  // ── Reset (guest switch-account, etc.) ────────────────────────────

  async function clear() {
    try {
      const notesS = await store(NOTES_STORE, 'readwrite');
      const padS   = await store(SCRATCHPAD_STORE, 'readwrite');
      await Promise.all([wrap(notesS.clear()), wrap(padS.clear())]);
    } catch { /* ignore */ }
  }

  return { get, set, delete: del, getAll, replaceAll, getScratchpad, setScratchpad, clear };
})();
