/* ─────────────────────────────────────────────────────────────────
   Remnant — app.js
   localStorage (account/tab metadata) + IndexedDB (note/scratchpad
   content) + Cloudflare KV sync, three auth tiers via auth.js.
   ───────────────────────────────────────────────────────────────── */
'use strict';

// ─── Constants ────────────────────────────────────────────────────

const STORAGE_KEY         = 'rmt_appdata';
const STORAGE_AUTH_KEY    = 'rmt_google_id_token';
const STORAGE_DISMISS_KEY = 'rmt_token_upgrade_dismissed';

// Sync cadence: not a fixed interval like a 60s ping. We sync when the
// page opens (if it's been more than an hour), on a coarse background
// check while the tab stays open, on a best-effort basis when the tab
// is hidden/closed, and on demand via the Save Session button.
const SYNC_THRESHOLD_MS      = 60 * 60 * 1000; // 1 hour
const SYNC_CHECK_INTERVAL_MS = 5 * 60 * 1000;  // re-check the threshold every 5 min while open

// ─── State ────────────────────────────────────────────────────────

// Content-type icons for the nav tree and tab bar — small material-
// style glyphs distinguishing Corpus/Scroll/Remnant/Cipher at a glance,
// recolored to match this app's existing palette tokens (brass-dark for
// Corpus/Scroll/Remnant, ink for Corpus's binding straps, oxide for
// Cipher — matching the same oxide tone already used for Cipher row
// label text). Base64-embedded, same technique as the brand logo and
// the pin/unpin icons, so the app stays a single set of static files
// with no extra image requests.
const NAV_ICON_CORPUS = 'data:image/png;base64,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';
const NAV_ICON_SCROLL = 'data:image/png;base64,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';
const NAV_ICON_REMNANT = 'data:image/png;base64,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';
const NAV_ICON_CIPHER = 'data:image/png;base64,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';

const App = {
  data: null,           // localStorage-shaped object: account/tab metadata only
  openNotes: {},         // in-memory cache of notes currently open in tabs: { [id]: note }
  activeNoteId: null,
  syncCheckTimer: null,
  // Cipher obscured-viewer keyboard navigation: click-to-enter, arrow
  // keys move the reveal, Escape exits. Mouse movement is ignored while
  // true — a deliberately separate mode, not a temporary hover override.
  // See enterCipherKeyboardMode/exitCipherKeyboardMode.
  _cipherKeyboardMode: false,
  // In-memory cache of the structure tree (Books/Chapters), rebuilt from
  // IndexedDB on boot and after any structural edit. Note CONTENT is never
  // cached wholesale here — only the lightweight book/chapter records and
  // enough note metadata (id, title, chapterId, order, updatedAt, type) to
  // render the tree without loading every note body into memory at once.
  books: {},
  chapters: {},
  noteSummaries: {},     // { [id]: { id, title, chapterId, order, updatedAt, type } } — for tree rendering
  drag: null,            // transient drag state, see "Drag and drop" section

  // ── Cipher session state — deliberately ALL outside App.data ───────
  // None of the fields below are ever read by saveLocal() or
  // assembleSyncPayload(), because neither function looks outside
  // App.data. That's not a filter that has to be remembered at every
  // persistence boundary — it's a structural guarantee: a Cipher's open/
  // unlocked state simply cannot reach localStorage or KV, because the
  // functions that write to those places never look here at all.
  openCipherIds: [],     // ordered array of Cipher ids currently open as tabs (mirrors tabState.openIds, but for Ciphers, and NEVER persisted)
  unlockedCiphers: {},   // { [cipherId]: { plaintext, key } } — only for Ciphers open AND successfully unlocked THIS session
  sessionCipherKeys: {}, // { [cipherId]: key } — the OPT-IN "remember for this session" cache; survives a Cipher tab being closed and reopened, but never a page reload

  // Illuminate mode: a per-Cipher, in-memory-only toggle for showing the
  // FULL plaintext (no spotlight masking at all) instead of the usual
  // disguised/spotlight rendering. Same persistence guarantee as the rest
  // of this block — never in App.data, so it can never reach localStorage
  // or KV. Always resets to off when a Cipher's tab is closed (see
  // closeTab) — there is no "stay illuminated across a close+reopen."
  // Requires re-entering the passphrase to ENTER, even if the Cipher is
  // already unlocked — full exposure is treated as a bigger commitment
  // than spotlight viewing, deliberately, and earns its own checkpoint.
  illuminatedCipherIds: [],
  illuminateIdleTimer: null, // see scheduleIlluminateIdleTimer / clearIlluminateIdleTimer
};

// Default data shape (localStorage). Note CONTENT is never stored here —
// only which notes are open and which is active. Content lives in
// NotesStore (IndexedDB) and is assembled into the KV blob separately.
function defaultData() {
  return {
    authMethod:   'guest',
    userToken:    Auth.generateToken(),
    workerUrl:    '',
    linkedGoogle: null,
    firstName:    '',
    lastName:     '',
    username:     '',
    tabState: {
      openIds:  [],   // ordered array of note ids currently open as tabs
      activeId: null,
    },
    // Nav panel UI state — which books/chapters are expanded, whether the
    // panel itself is open, and whether it's pinned (claims layout space)
    // or pop-out (overlays the layout). Persisted because losing your
    // place in the tree on every reload would undercut the point of having
    // one, and because "pinned" is a workflow preference worth remembering
    // across devices via KV sync just like everything else in this object.
    navState: {
      panelOpen:        false,
      pinned:           false,
      expandedBookIds:    [],
      expandedChapterIds: [],
    },
    lastSyncTime: 0,      // epoch ms of last successful KV push
    pendingSync:  false,  // true when local content has changed since lastSyncTime
    lastModified: Date.now(),
    // "Don't show this warning again" preference for the Cipher creation
    // modal's no-recovery warning. Fine to sync via KV like any other UI
    // preference — it's just a dismissal flag, holds no secret of any kind.
    cipherWarningDismissed: false,
    // Disguise text style for the spotlight-reveal editor: 'lorem' (looks
    // like real prose — better disguise to a glancing onlooker, but can
    // be mildly distracting to the user's own eye since it's almost-
    // readable) or 'noise' (abstract character clusters — quieter to the
    // user, slightly weaker disguise). User-selectable in settings.
    cipherDisguiseMode: 'lorem',
  };
}

function mergeData(raw) {
  const d = defaultData();
  if (!raw || typeof raw !== 'object') return d;
  return {
    ...d,
    ...raw,
    tabState: (raw.tabState && typeof raw.tabState === 'object')
      ? { openIds: Array.isArray(raw.tabState.openIds) ? raw.tabState.openIds : [], activeId: raw.tabState.activeId ?? null }
      : d.tabState,
    navState: (raw.navState && typeof raw.navState === 'object')
      ? {
          panelOpen:          !!raw.navState.panelOpen,
          pinned:             !!raw.navState.pinned,
          expandedBookIds:    Array.isArray(raw.navState.expandedBookIds)    ? raw.navState.expandedBookIds    : [],
          expandedChapterIds: Array.isArray(raw.navState.expandedChapterIds) ? raw.navState.expandedChapterIds : [],
        }
      : d.navState,
  };
}

// ─── LocalStorage helpers ─────────────────────────────────────────

const ls = {
  get:    k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set:    (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) { console.error('[Remnant] localStorage.set failed:', e); } },
  remove: k => { try { localStorage.removeItem(k); } catch {} },
};

function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(App.data));
  } catch(e) {
    console.error('[Remnant] saveLocal failed — data NOT persisted:', e);
    showToast('⚠️ Could not save — storage may be full or unavailable');
  }
}

// markDirty() — call after any note/scratchpad/tab-state change.
// Persists the pendingSync flag itself (not just in-memory) so a reload
// before the next sync still knows there's unsynced content.
function markDirty() {
  App.data.pendingSync  = true;
  App.data.lastModified = Date.now();
  saveLocal();
  updateSyncIndicator();
}

function updateSyncIndicator() {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  el.style.display = (App.data?.pendingSync && getWorkerUrl()) ? '' : 'none';
}

// ─── Worker sync ──────────────────────────────────────────────────

function getWorkerUrl() {
  return App.data?.workerUrl || '';
}

// assembleSyncPayload() — gathers localStorage metadata + IndexedDB note
// content + structure (books/chapters) + scratchpad into the one JSON blob
// that goes to KV. This is the piece that doesn't exist in the Refectory
// pattern: there, everything synced was already in one synchronous object.
// Here, content lives in IndexedDB, so building the payload is async.
async function assembleSyncPayload() {
  const [notes, books, chapters, scratchpad] = await Promise.all([
    NotesStore.getAll(),
    NotesStore.getAllBooks(),
    NotesStore.getAllChapters(),
    NotesStore.getScratchpad(),
  ]);
  return {
    ...App.data,
    notes,
    structure: { books, chapters },
    scratchpad: scratchpad || { content: '', updatedAt: 0 },
  };
}

async function pushToWorker() {
  const base  = getWorkerUrl().replace(/\/+$/, '');
  if (!base) return false;
  const token = App.data?.userToken;
  if (!token) return false;

  const payload = await assembleSyncPayload();
  const body    = JSON.stringify(payload);
  const headers = await Auth._authHeaders('PUT', token, body);
  try {
    const res = await fetch(`${base}/storage/${encodeURIComponent(token)}/profile`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
    });
    if (res.ok) {
      App.data.pendingSync  = false;
      App.data.lastSyncTime = Date.now();
      saveLocal();
      updateSyncIndicator();
      updateLastSyncedLabel();
    } else {
      const errText = await res.text().catch(() => String(res.status));
      console.error(`[Remnant] pushToWorker failed (${res.status}):`, errText);
    }
    return res.ok;
  } catch(e) {
    console.error('[Remnant] pushToWorker network error:', e);
    return false;
  }
}

async function pullFromWorker() {
  const base  = getWorkerUrl().replace(/\/+$/, '');
  if (!base) return null;
  const token   = App.data?.userToken;
  if (!token) return null;
  const headers = await Auth._authHeaders('GET', token, '');
  try {
    const res = await fetch(`${base}/storage/${encodeURIComponent(token)}/profile`, { headers });
    if (res.status === 410) {
      // Token was migrated to a Google account on another device.
      App.data.authMethod = 'google';
      saveLocal();
      return null;
    }

    const migratedTo = res.headers.get('X-Token-Migrated');
    if (migratedTo) {
      const j = await res.json();
      const remote = j.value ?? j;
      const { notes, structure, scratchpad, ...metadata } = remote;
      const migrated = Auth.handlePullMigration(migratedTo, mergeData(metadata));
      App.data = migrated;
      await Promise.all([
        NotesStore.replaceAll(notes || {}),
        NotesStore.replaceAllBooks((structure && structure.books) || {}),
        NotesStore.replaceAllChapters((structure && structure.chapters) || {}),
        NotesStore.setScratchpad((scratchpad && scratchpad.content) || ''),
      ]);
      saveLocal();
      return remote;
    }

    if (!res.ok) return null;
    const j = await res.json();
    return j.value ?? j;
  } catch { return null; }
}

// shouldSync() — the heart of the new cadence: sync if there's anything
// dirty AND it's been more than SYNC_THRESHOLD_MS since the last
// successful push. The Save Session button bypasses this check entirely.
function shouldSync() {
  if (Auth.isGuest()) return false;
  if (!getWorkerUrl()) return false;
  if (!App.data.pendingSync) return false;
  return (Date.now() - (App.data.lastSyncTime || 0)) >= SYNC_THRESHOLD_MS;
}

async function maybeSync() {
  if (!shouldSync()) return;
  await pushToWorker();
}

function startSyncPing() {
  if (App.syncCheckTimer) clearInterval(App.syncCheckTimer);
  App.syncCheckTimer = setInterval(maybeSync, SYNC_CHECK_INTERVAL_MS);
}

// Best-effort push when the tab is hidden or being closed — no prompt,
// no guarantee, just a quiet attempt if there's unsynced content. This
// covers the "open all day, never revisits the threshold check" gap and
// the "closing the laptop" moment, without relying on a beforeunload
// dialog that can't reliably await a network call anyway.
function bestEffortPushOnHide() {
  if (Auth.isGuest()) return;
  if (!getWorkerUrl()) return;
  if (!App.data.pendingSync) return;
  // Fire and forget — we cannot await this once the page is unloading.
  pushToWorker();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') bestEffortPushOnHide();
});
window.addEventListener('beforeunload', bestEffortPushOnHide);

function updateLastSyncedLabel() {
  const el = document.getElementById('settings-last-synced');
  if (!el) return;
  const t = App.data?.lastSyncTime;
  el.textContent = t ? new Date(t).toLocaleString() : 'Never';
}

// ─── Save Session button (manual sync, bypasses the threshold) ────

function updateSaveSessionVisibility() {
  const btn = document.getElementById('save-session-btn');
  if (!btn) return;
  btn.style.display = (!Auth.isGuest() && getWorkerUrl()) ? '' : 'none';
}

document.getElementById('save-session-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('save-session-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  const ok = await pushToWorker();
  btn.disabled = false;
  btn.textContent = 'Save Session';
  showToast(ok ? 'Session saved ✓' : 'Could not save — check your connection');
});

// ─── Toast ────────────────────────────────────────────────────────

let toastTimer = null;
function showToast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ─── Modals ───────────────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ─── Notes: creation, switching, editing ──────────────────────────

function generateNoteId() {
  return 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// createNote(chapterId) — chapterId is optional; omitted/null means the
// note starts unfiled. Called both from the tab bar's "+" (always unfiled)
// and from the nav tree's "+ New Note" row under a specific chapter.
async function createNote(chapterId = null) {
  const id = generateNoteId();
  const siblingNotes = Object.values(App.noteSummaries).filter(n => n.chapterId === chapterId);
  const order = nextOrder(siblingNotes);
  const note = { id, chapterId, title: '', content: '', order, createdAt: Date.now(), updatedAt: Date.now() };
  await NotesStore.set(id, note);
  App.openNotes[id] = note;
  App.noteSummaries[id] = { id, title: '', chapterId, order, updatedAt: note.updatedAt };
  if (chapterId && App.chapters[chapterId]) {
    App.chapters[chapterId].noteIds.push(id);
    await NotesStore.setChapter(chapterId, App.chapters[chapterId]);
  }
  App.data.tabState.openIds.push(id);
  setActiveNote(id);
  markDirty();
  renderTabs();
  renderNavTree();
}

async function openNoteInTab(id) {
  if (!App.openNotes[id]) {
    const note = await NotesStore.get(id);
    if (!note) return;
    App.openNotes[id] = note;
  }
  if (!App.data.tabState.openIds.includes(id)) {
    App.data.tabState.openIds.push(id);
  }
  setActiveNote(id);
  markDirty();
  renderTabs();
  revealNoteInNavTree(id);
}

function setActiveNote(id) {
  if (App._cipherKeyboardMode && App.activeNoteId !== id) exitCipherKeyboardMode();
  App.activeNoteId = id;
  // Only a plain Remnant's active-tab id is ever written into App.data —
  // that object is what gets persisted to localStorage and synced to KV.
  // A Cipher becoming active must never appear there, full stop; see the
  // "Ciphers: creation, unlock, editing" section header for the full
  // reasoning on why Cipher tab/session state stays structurally outside
  // App.data everywhere, not just here.
  if (!isCipherNote(App.noteSummaries[id])) {
    App.data.tabState.activeId = id;
  }
  renderActiveNote();
}

async function closeTab(id) {
  const wasCipher = App.openCipherIds.includes(id);
  if (wasCipher) {
    if (App._cipherKeyboardMode && App.activeNoteId === id) exitCipherKeyboardMode();
    App.openCipherIds = App.openCipherIds.filter(x => x !== id);
    // obscureCipher flushes any pending debounced save (if this Cipher
    // is illuminated and mid-edit) BEFORE we delete its unlocked-state
    // entry below — calling it first, and awaiting it, means a save
    // started just before closing the tab still completes and writes to
    // encrypted storage, rather than being silently lost because
    // unlockedCiphers[id] was already gone by the time the flush ran.
    await obscureCipher(id);
    // Closing a Cipher tab clears its UNLOCKED state — reopening it
    // (this session or not) re-prompts, unless a session-cached key
    // exists from an explicit "remember for this session" earlier.
    delete App.unlockedCiphers[id];
  } else {
    App.data.tabState.openIds = App.data.tabState.openIds.filter(x => x !== id);
  }
  // The body field must repopulate fresh if this same id ever becomes
  // active again later (e.g. a Cipher reopened via session-cache) —
  // without this, a stale match in renderActiveNote's "already showing
  // this id, skip repopulating" check could leave the body showing
  // nothing/wrong content after a close+reopen.
  if (App._bodyShowingNoteId === id) App._bodyShowingNoteId = null;

  if (App.activeNoteId === id) {
    // Fall back to whichever tab list still has something open —
    // Remnant tabs first, then Cipher tabs, matching how they're
    // concatenated for rendering (see renderTabs).
    const remaining = [...App.data.tabState.openIds, ...App.openCipherIds];
    App.activeNoteId = remaining.length ? remaining[remaining.length - 1] : null;
    if (!isCipherNote(App.noteSummaries[App.activeNoteId])) {
      App.data.tabState.activeId = App.activeNoteId;
    } else {
      App.data.tabState.activeId = null;
    }
  }
  markDirty();
  renderTabs();
  renderActiveNote();
}

async function deleteNote(id) {
  const summary = App.noteSummaries[id];
  if (summary?.chapterId && App.chapters[summary.chapterId]) {
    const chapter = App.chapters[summary.chapterId];
    chapter.noteIds = chapter.noteIds.filter(nid => nid !== id);
    await NotesStore.setChapter(chapter.id, chapter);
  }
  await NotesStore.delete(id);
  delete App.openNotes[id];
  delete App.noteSummaries[id];
  delete App.unlockedCiphers[id];
  delete App.sessionCipherKeys[id];
  await closeTab(id);
  markDirty();
  renderNavTree();
}

// Debounced autosave-to-IndexedDB on every keystroke. This is the first
// line of defense against data loss — independent of KV sync cadence.
let saveNoteTimer = null;
function scheduleSaveActiveNote() {
  clearTimeout(saveNoteTimer);
  saveNoteTimer = setTimeout(saveActiveNote, 400);
}

async function saveActiveNote() {
  const id = App.activeNoteId;
  if (!id) return;
  const note = App.openNotes[id];
  if (!note) return;
  note.title     = document.getElementById('note-title-input').value;
  note.content   = document.getElementById('note-body-input').value;
  note.updatedAt = Date.now();
  await NotesStore.set(id, note);
  if (App.noteSummaries[id]) {
    App.noteSummaries[id].title     = note.title;
    App.noteSummaries[id].updatedAt = note.updatedAt;
  }
  markDirty();
  renderTabs();    // tab title may have changed
  renderNavTree();  // nav row label may have changed
}

// ─── Ciphers: creation, unlock, editing ────────────────────────────
//
// A Cipher is a Remnant (type: 'cipher' on the note record) whose body
// is end-to-end encrypted with a user passphrase. See cipher.js for the
// crypto itself — this section only orchestrates: modals, in-memory
// unlock state, and wiring a Cipher into the same tab/nav system a
// plain Remnant already uses.
//
// Three pieces of in-memory-only state (see App object, top of file):
//   App.openCipherIds    — which Cipher tabs are open right now
//   App.unlockedCiphers  — { [id]: { plaintext, key } } for ones unlocked
//                           THIS session (cleared when the tab is closed)
//   App.sessionCipherKeys — { [id]: key } for ones the user opted into
//                            "remember for this session" — survives a
//                            tab close+reopen, but never a page reload
// None of these three are ever read by saveLocal() or
// assembleSyncPayload(), because neither function looks outside
// App.data — so Cipher session/unlock state structurally cannot reach
// localStorage or KV sync, not as a rule that has to be remembered, but
// because the relevant code paths never look here at all.

function generateCipherId() {
  return generateId('k'); // 'k' for cipher — 'c' is already Chapter's prefix
}

function isCipherNote(noteOrSummary) {
  return noteOrSummary?.type === 'cipher';
}

// openCipherCreateModal(chapterId) — entry point from the nav tree's
// "+ New Cipher" row. chapterId is optional/null for an unfiled Cipher.
function openCipherCreateModal(chapterId = null) {
  App._pendingCipherChapterId = chapterId;
  const dontRemind = !!App.data.cipherWarningDismissed;
  document.getElementById('cipher-create-warning').style.display = dontRemind ? 'none' : '';
  document.getElementById('cipher-create-passphrase').value = '';
  document.getElementById('cipher-create-passphrase-confirm').value = '';
  document.getElementById('cipher-create-dont-remind').checked = dontRemind;
  document.getElementById('cipher-create-status').textContent = '';
  openModal('modal-cipher-create');
  document.getElementById('cipher-create-passphrase').focus();
}

async function submitCipherCreate() {
  const statusEl = document.getElementById('cipher-create-status');
  const pass1 = document.getElementById('cipher-create-passphrase').value;
  const pass2 = document.getElementById('cipher-create-passphrase-confirm').value;

  if (!pass1) { statusEl.textContent = 'Enter a passphrase.'; return; }
  if (pass1 !== pass2) { statusEl.textContent = 'Passphrases do not match.'; return; }
  if (pass1.length < 4) { statusEl.textContent = 'Passphrase is too short.'; return; }

  const confirmBtn = document.getElementById('cipher-create-confirm-btn');
  confirmBtn.disabled = true;
  statusEl.style.color = 'var(--muted)';
  statusEl.textContent = 'Deriving key…'; // Argon2id is deliberately slow — give the user something to read

  // This try/catch guards ONLY the actual encryption + storage write —
  // the part that can legitimately fail (e.g. Argon2 not loaded, a
  // storage quota error). Bookkeeping/rendering after a successful
  // creation is deliberately outside it, same reasoning as
  // submitCipherUnlock: a rendering issue must never be mislabeled as
  // "creating the Cipher failed" when it actually succeeded.
  const chapterId = App._pendingCipherChapterId;
  const id = generateCipherId();
  let record, key, order;
  try {
    const result = await Cipher.createRecord(pass1, ''); // fresh Cipher starts blank, same as a fresh Remnant
    record = result.record;
    key    = result.key;
    const siblingNotes = Object.values(App.noteSummaries).filter(n => n.chapterId === chapterId);
    order = nextOrder(siblingNotes);
    const note = {
      id, chapterId, title: '', type: 'cipher', encrypted: record,
      order, createdAt: Date.now(), updatedAt: Date.now(),
    };
    await NotesStore.set(id, note);
  } catch (e) {
    console.error('[Remnant] Cipher creation failed:', e);
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = 'Something went wrong creating the Cipher. Please try again.';
    confirmBtn.disabled = false;
    return;
  }
  confirmBtn.disabled = false;

  // Creation succeeded — everything below is bookkeeping/rendering.
  App.noteSummaries[id] = { id, title: '', chapterId, order, updatedAt: Date.now(), type: 'cipher' };
  if (chapterId && App.chapters[chapterId]) {
    App.chapters[chapterId].noteIds.push(id);
    await NotesStore.setChapter(chapterId, App.chapters[chapterId]);
  }

  // Just created it — already "unlocked" for this session, no need to
  // immediately re-prompt for the passphrase we just set. Also
  // auto-ILLUMINATED (not just unlocked): the user just set this
  // passphrase moments ago, and a brand-new, empty Cipher has nothing
  // to protect yet — landing in the read-only obscured viewer with no
  // way to start typing would be a bad first moment. Every Cipher
  // opened or reopened AFTER this point goes through the normal
  // unlock-without-decrypt path; this is deliberately the one exception.
  App.unlockedCiphers[id] = { key, plaintext: '' };
  App.illuminatedCipherIds.push(id);
  App.openCipherIds.push(id);
  setActiveNote(id);

  if (document.getElementById('cipher-create-dont-remind').checked) {
    App.data.cipherWarningDismissed = true;
    saveLocal();
  }

  closeModal('modal-cipher-create');
  markDirty();
  renderTabs();
  renderNavTree();
  renderActiveNote();
}

document.getElementById('cipher-create-confirm-btn')?.addEventListener('click', submitCipherCreate);
document.getElementById('cipher-create-cancel-btn')?.addEventListener('click', () => closeModal('modal-cipher-create'));
document.getElementById('cipher-create-close-btn')?.addEventListener('click', () => closeModal('modal-cipher-create'));

// openCipherInTab(id) — entry point from clicking a Cipher row in the nav
// tree, or re-selecting an already-open Cipher tab. If the Cipher is
// already unlocked this session (or a session-cached key exists), skip
// the passphrase prompt entirely; otherwise show the unlock modal.
async function openCipherInTab(id) {
  if (!App.openCipherIds.includes(id)) App.openCipherIds.push(id);

  if (App.unlockedCiphers[id]) {
    setActiveNote(id);
    renderTabs();
    renderActiveNote();
    revealNoteInNavTree(id);
    return;
  }

  const cachedKey = App.sessionCipherKeys[id];
  if (cachedKey) {
    const note = await NotesStore.get(id);
    try {
      // Prove the cached key still works by decrypting just the first
      // line — same reasoning as verifyAndDeriveKey: a wrong/stale key
      // fails on ANY line via AES-GCM's auth tag, so this is exactly as
      // conclusive as decrypting everything, without actually doing so.
      await Cipher.decryptLineWithKey(cachedKey, note.encrypted.lines[0]);
      App.unlockedCiphers[id] = { key: cachedKey, plaintext: null };
      setActiveNote(id);
      renderTabs();
      renderActiveNote();
      revealNoteInNavTree(id);
      return;
    } catch {
      // Cached key no longer works (shouldn't normally happen) — fall
      // through to a fresh prompt rather than fail silently.
      delete App.sessionCipherKeys[id];
    }
  }

  openCipherUnlockModal(id);
}

function openCipherUnlockModal(id) {
  App._pendingUnlockCipherId = id;
  const summary = App.noteSummaries[id];
  document.getElementById('cipher-unlock-name').textContent =
    (summary?.title?.trim() || 'Untitled Cipher') + ' is locked.';
  document.getElementById('cipher-unlock-passphrase').value = '';
  document.getElementById('cipher-unlock-remember').checked = false;
  document.getElementById('cipher-unlock-status').textContent = '';
  openModal('modal-cipher-unlock');
  document.getElementById('cipher-unlock-passphrase').focus();
}

async function submitCipherUnlock() {
  const id = App._pendingUnlockCipherId;
  if (!id) return;
  const statusEl = document.getElementById('cipher-unlock-status');
  const passphrase = document.getElementById('cipher-unlock-passphrase').value;
  if (!passphrase) { statusEl.textContent = 'Enter the passphrase.'; return; }

  const confirmBtn = document.getElementById('cipher-unlock-confirm-btn');
  confirmBtn.disabled = true;
  statusEl.style.color = 'var(--muted)';
  statusEl.textContent = 'Deriving key…';

  // This try/catch guards ONLY the actual unlock attempt. Deliberately
  // narrow: a rendering hiccup AFTER a successful unlock must never be
  // mischaracterized as a wrong passphrase or a generic unlock failure.
  //
  // Uses verifyAndDeriveKey, NOT decryptRecord — unlock now only proves
  // the passphrase is correct (by decrypting just the first line) and
  // derives a working key. It does NOT decrypt the rest of the body.
  // The document stays genuinely encrypted at rest after unlock; only
  // the line currently under the cursor gets decrypted on demand by the
  // read-only obscured viewer (see renderCipherObscuredViewer). Full-
  // body decryption is reserved for Illuminate — an explicit, separately
  // re-prompted, higher-exposure editing mode.
  let key;
  try {
    const note = await NotesStore.get(id);
    if (!note || !note.encrypted) throw new Error('NOT_FOUND');
    const result = await Cipher.verifyAndDeriveKey(passphrase, note.encrypted);
    key = result.key;
  } catch (e) {
    if (e.message === 'WRONG_PASSPHRASE') {
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = 'Incorrect passphrase.';
    } else if (e.message === 'MALFORMED_RECORD') {
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = 'This Cipher is in a format that can no longer be read. It cannot be unlocked — you can delete it from the Library.';
    } else {
      console.error('[Remnant] Cipher unlock failed:', e);
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = 'Something went wrong. Please try again.';
    }
    confirmBtn.disabled = false;
    return;
  }
  confirmBtn.disabled = false;

  // Unlock succeeded — everything from here on is bookkeeping/rendering,
  // not authentication. No try/catch needed for this app's own state
  // updates; if a rendering call ever throws, that's a real bug worth
  // seeing as an uncaught error, not something to silently swallow or
  // mislabel as a failed unlock.
  // plaintext starts null — it's only ever populated by illuminateCipher,
  // and discarded again by obscureCipher. See the "Ciphers" section
  // header comment for the full reasoning on why this split exists.
  App.unlockedCiphers[id] = { key, plaintext: null };
  if (document.getElementById('cipher-unlock-remember').checked) {
    App.sessionCipherKeys[id] = key;
  }
  closeModal('modal-cipher-unlock');
  setActiveNote(id);
  renderTabs();
  renderActiveNote();
  revealNoteInNavTree(id);
}

document.getElementById('cipher-unlock-confirm-btn')?.addEventListener('click', submitCipherUnlock);
document.getElementById('cipher-unlock-cancel-btn')?.addEventListener('click', () => closeModal('modal-cipher-unlock'));
document.getElementById('cipher-unlock-close-btn')?.addEventListener('click', () => closeModal('modal-cipher-unlock'));

// saveActiveCipher() — the Cipher equivalent of saveActiveNote(). Title
// stays plaintext (matches a Remnant; see notesStore.js header for why).
// Body is re-encrypted with a FRESH IV on every save (never reuse an IV
// with the same key — see cipher.js) using the already-derived key held
// in App.unlockedCiphers, so saving never re-runs Argon2id — only the
// initial unlock (or creation) pays that cost.
// NOTE: this currently writes through the same #note-title-input/
// #note-body-input fields a plain Remnant uses. Stage 3 replaces the
// body field with the spotlight-reveal editor; the encrypt/save path
// underneath does not change.
async function saveActiveCipher() {
  const id = App.activeNoteId;
  if (!id) return;
  const unlocked = App.unlockedCiphers[id];
  if (!unlocked) return;

  const note = await NotesStore.get(id);
  if (!note) return;

  const newTitle = document.getElementById('note-title-input').value;
  const newPlaintext = document.getElementById('note-body-input').value;

  unlocked.plaintext = newPlaintext;

  const saltBytes = (() => {
    const binary = atob(note.encrypted.salt);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  })();

  // Re-encrypts the ENTIRE line array together on every save (not a diff
  // of just the changed lines) — see cipher.js header for why this
  // tradeoff was chosen deliberately over per-line diffing.
  const newLines = newPlaintext.split('\n');
  note.title     = newTitle;
  note.encrypted = await Cipher.encryptLinesWithKey(unlocked.key, newLines, saltBytes, note.encrypted.kdfParams);
  note.updatedAt = Date.now();
  await NotesStore.set(id, note);

  if (App.noteSummaries[id]) {
    App.noteSummaries[id].title     = newTitle;
    App.noteSummaries[id].updatedAt = note.updatedAt;
  }
  markDirty();
  renderTabs();
  renderNavTree();
}

let saveCipherTimer = null;
function scheduleSaveActiveCipher() {
  clearTimeout(saveCipherTimer);
  saveCipherTimer = setTimeout(saveActiveCipher, 400);
}

// ─── Disguise text generation (currently UNUSED — see note below) ──
//
// Produces ciphertext-looking gibberish, character-for-character
// matching a real token's length. Kept for a later theming pass, but
// NOT currently wired into the spotlight overlay: substituting noise
// characters of matching length does not reliably reproduce the real
// text's wrap points (confirmed empirically — span-per-word layout
// with substituted text measured a different total wrapped height than
// the real text at the same width, causing some rows to become
// unreachable). The overlay now renders the REAL text in every token
// and disguises it with CSS blur alone, which guarantees identical
// wrapping since it's literally the same string. If scrambled-character
// disguise comes back later, it should use a "mirror div" style
// technique (real text drives layout; a separate, position-matched
// element renders the substitute glyphs on top) rather than building
// independent layout from substituted text.

const NOISE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*+=/?';
function noiseToken(token) {
  let out = '';
  for (let i = 0; i < token.length; i++) {
    out += NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)];
  }
  return out;
}

// ─── Illuminate / Obscure ───────────────────────────────────────────
//
// "Illuminate" shows a Cipher's FULL plaintext with no spotlight masking
// at all — useful for editing or proofreading, where seeing only one
// line at a time under the cursor is impractical. "Obscure" reverses it.
//
// This is a pure RENDERING toggle, not a re-decrypt: the plaintext is
// already sitting in App.unlockedCiphers[id].plaintext once a Cipher is
// unlocked at all, regardless of illuminate state. Illuminating doesn't
// fetch or compute anything new — it just changes how the body textarea
// is drawn. That's why entering/exiting is instant.
//
// Despite that, ENTERING illuminate mode always re-prompts for the
// passphrase, even if the Cipher is already unlocked this session —
// full exposure is treated as a bigger commitment than ordinary
// spotlight viewing, and earns its own checkpoint. The session-cache
// "remember" checkbox on the unlock modal never skips this prompt.
//
// Three independent exits, all funneled through one shared function
// (obscureCipher) so there's exactly one place that does the actual
// state cleanup:
//   1. Manual "Obscure" button click
//   2. Inactivity timeout (no typing/clicking while illuminated)
//   3. Tab/window losing visibility or focus (switching away)
// Closing the Cipher's tab ALSO always clears illuminate state (see
// closeTab) — there is no "stay illuminated across a close+reopen."

const ILLUMINATE_IDLE_MS = 3 * 60 * 1000; // 3 minutes of inactivity while illuminated

function isIlluminated(id) {
  return App.illuminatedCipherIds.includes(id);
}

function openCipherIlluminateModal() {
  const id = App.activeNoteId;
  if (!id || !isCipherNote(App.noteSummaries[id])) return;
  App._pendingIlluminateCipherId = id;
  document.getElementById('cipher-illuminate-passphrase').value = '';
  document.getElementById('cipher-illuminate-status').textContent = '';
  openModal('modal-cipher-illuminate');
  document.getElementById('cipher-illuminate-passphrase').focus();
}

async function submitCipherIlluminate() {
  const id = App._pendingIlluminateCipherId;
  if (!id) return;
  const statusEl = document.getElementById('cipher-illuminate-status');
  const passphrase = document.getElementById('cipher-illuminate-passphrase').value;
  if (!passphrase) { statusEl.textContent = 'Enter the passphrase.'; return; }

  const confirmBtn = document.getElementById('cipher-illuminate-confirm-btn');
  confirmBtn.disabled = true;
  statusEl.style.color = 'var(--muted)';
  statusEl.textContent = 'Verifying…';

  // Narrow try/catch, same discipline as submitCipherUnlock: this guards
  // ONLY the passphrase re-verification AND the full-body decryption that
  // now happens here. Illuminate is the ONE place a Cipher's full
  // plaintext gets reconstructed in memory — unlock (submitCipherUnlock)
  // deliberately stops short of this, decrypting only enough to verify
  // the passphrase. Rendering afterward is outside this try/catch.
  let plaintext;
  try {
    const note = await NotesStore.get(id);
    if (!note || !note.encrypted) throw new Error('NOT_FOUND');
    const result = await Cipher.decryptRecord(passphrase, note.encrypted);
    plaintext = result.plaintext;
  } catch (e) {
    if (e.message === 'WRONG_PASSPHRASE') {
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = 'Incorrect passphrase.';
    } else if (e.message === 'MALFORMED_RECORD') {
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = 'This Cipher is in a format that can no longer be read.';
    } else {
      console.error('[Remnant] Cipher illuminate verification failed:', e);
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = 'Something went wrong. Please try again.';
    }
    confirmBtn.disabled = false;
    return;
  }
  confirmBtn.disabled = false;

  // Populate the plaintext NOW — this is the moment full decryption
  // happens, deferred from unlock specifically so it only occurs when
  // the user has explicitly chosen the higher-exposure editing mode.
  if (App.unlockedCiphers[id]) App.unlockedCiphers[id].plaintext = plaintext;
  illuminateCipher(id);
  closeModal('modal-cipher-illuminate');
}

function illuminateCipher(id) {
  if (!App.illuminatedCipherIds.includes(id)) App.illuminatedCipherIds.push(id);
  resetIlluminateIdleTimer();
  if (App._cipherKeyboardMode) exitCipherKeyboardMode(); // the viewer is about to be replaced by the textarea
  renderActiveNote();
  renderTabs();
}

// obscureCipher(id) — the single shared exit path for all three trigger
// types. Always safe to call even if the given id isn't illuminated
// (e.g. the idle timer firing after the user already clicked Obscure
// manually) — it's idempotent.
async function obscureCipher(id) {
  const i = App.illuminatedCipherIds.indexOf(id);
  if (i !== -1) App.illuminatedCipherIds.splice(i, 1);
  clearIlluminateIdleTimer();

  // Flush any pending debounced save BEFORE discarding plaintext — and
  // AWAIT it. saveActiveCipher itself writes the textarea's current
  // value into unlocked.plaintext as part of saving; if that write
  // happens AFTER this function's own plaintext = null below (which it
  // would, if this were fire-and-forget instead of awaited), the save's
  // own assignment silently overwrites the discard right back to the
  // real text moments later. Awaiting guarantees strict ordering: save
  // completes fully, including its own plaintext write, THEN we null it.
  if (saveCipherTimer) {
    clearTimeout(saveCipherTimer);
    saveCipherTimer = null;
    if (App.activeNoteId === id) await saveActiveCipher();
  }

  // Discard the plaintext — this is the other half of "only decrypted
  // while illuminated." Once obscured, the document goes back to
  // genuinely encrypted-at-rest-in-memory; only the line under the
  // cursor in the read-only viewer gets decrypted again, on demand.
  if (App.unlockedCiphers[id]) App.unlockedCiphers[id].plaintext = null;

  if (App.activeNoteId === id) {
    renderActiveNote();
    renderTabs();
  }
}

function resetIlluminateIdleTimer() {
  clearIlluminateIdleTimer();
  const id = App.activeNoteId;
  App.illuminateIdleTimer = setTimeout(() => {
    if (id) obscureCipher(id);
  }, ILLUMINATE_IDLE_MS);
}

function clearIlluminateIdleTimer() {
  if (App.illuminateIdleTimer) {
    clearTimeout(App.illuminateIdleTimer);
    App.illuminateIdleTimer = null;
  }
}

// Trigger 3a: tab/window visibility change (switching to another browser
// tab, minimizing, etc). Also re-checked on becoming VISIBLE again, not
// just hidden — mobile browsers commonly freeze JS execution entirely
// while backgrounded, so the 'hidden' handler may not run until the tab
// is already foregrounded again, by which point stale illuminated
// content could already be painted. Obscuring again on return closes
// that gap.
function obscureAllIlluminated() {
  App.illuminatedCipherIds.slice().forEach(obscureCipher); // slice() — obscureCipher mutates the array we'd otherwise be iterating
}
document.addEventListener('visibilitychange', () => {
  obscureAllIlluminated();
});
// Trigger 3b: window losing focus (switching to another application
// entirely, not just another browser tab — visibilitychange alone
// doesn't always catch this depending on OS/window manager behavior).
window.addEventListener('blur', obscureAllIlluminated);
window.addEventListener('pagehide', obscureAllIlluminated);

document.getElementById('cipher-illuminate-btn')?.addEventListener('click', openCipherIlluminateModal);
document.getElementById('cipher-illuminate-confirm-btn')?.addEventListener('click', submitCipherIlluminate);
document.getElementById('cipher-illuminate-cancel-btn')?.addEventListener('click', () => closeModal('modal-cipher-illuminate'));
document.getElementById('cipher-illuminate-close-btn')?.addEventListener('click', () => closeModal('modal-cipher-illuminate'));
document.getElementById('cipher-obscure-btn')?.addEventListener('click', () => {
  if (App.activeNoteId) obscureCipher(App.activeNoteId);
});

// Trigger 2: any typing/clicking while illuminated resets the idle clock.
// Scoped to the title/body inputs specifically — those are the signals
// that the user is actively present and working, not just any DOM event.
['input', 'click'].forEach(evt => {
  document.getElementById('note-title-input')?.addEventListener(evt, () => {
    if (isIlluminated(App.activeNoteId)) resetIlluminateIdleTimer();
  });
  document.getElementById('note-body-input')?.addEventListener(evt, () => {
    if (isIlluminated(App.activeNoteId)) resetIlluminateIdleTimer();
  });
});

// ─── Scratchpad ─────────────────────────────────────────────────────

let saveScratchpadTimer = null;
function scheduleSaveScratchpad() {
  clearTimeout(saveScratchpadTimer);
  saveScratchpadTimer = setTimeout(async () => {
    const content = document.getElementById('scratchpad-input').value;
    await NotesStore.setScratchpad(content);
    markDirty();
  }, 400);
}

async function loadScratchpad() {
  const pad = await NotesStore.getScratchpad();
  document.getElementById('scratchpad-input').value = (pad && pad.content) || '';
}

// ─── Books & Chapters: data operations ─────────────────────────────
// "Unfiled Notes" is deliberately NOT a Book/Chapter record — it's just
// the set of notes whose chapterId is null. See notesStore.js header.

function generateId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// nextOrder(siblings) — siblings is an array of records that already carry
// an `order` field. New items get appended to the end of their container.
function nextOrder(siblings) {
  if (!siblings.length) return 0;
  return Math.max(...siblings.map(s => s.order || 0)) + 1;
}

async function createBook(name) {
  const id = generateId('b');
  const existingBooks = Object.values(App.books);
  const book = {
    id, name: name || 'Untitled Corpus', description: '',
    chapterIds: [], order: nextOrder(existingBooks),
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await NotesStore.setBook(id, book);
  App.books[id] = book;
  setBookExpanded(id, true); // a freshly created corpus opens expanded — it's empty, show the "+ New Scroll" row right away
  markDirty();
  renderNavTree();
  return id;
}

async function createChapter(bookId, name) {
  const book = App.books[bookId];
  if (!book) return null;
  const id = generateId('c');
  const existingChapters = Object.values(App.chapters).filter(c => c.bookId === bookId);
  const chapter = {
    id, bookId, name: name || 'Untitled Scroll', description: '',
    noteIds: [], order: nextOrder(existingChapters),
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await NotesStore.setChapter(id, chapter);
  App.chapters[id] = chapter;
  book.chapterIds.push(id);
  book.updatedAt = Date.now();
  await NotesStore.setBook(bookId, book);
  setChapterExpanded(id, true);
  markDirty();
  renderNavTree();
  return id;
}

// renameBook/renameChapter — small, focused setters rather than a generic
// "update" function, since name is the one field the nav UI edits inline.
async function renameBook(id, name) {
  const book = App.books[id];
  if (!book) return;
  book.name = name;
  book.updatedAt = Date.now();
  await NotesStore.setBook(id, book);
  markDirty();
  renderNavTree();
}

async function renameChapter(id, name) {
  const chapter = App.chapters[id];
  if (!chapter) return;
  chapter.name = name;
  chapter.updatedAt = Date.now();
  await NotesStore.setChapter(id, chapter);
  markDirty();
  renderNavTree();
}

// deleteBook/deleteChapter — deleting a container does NOT delete its
// contents; chapters/notes inside become unfiled-equivalent (chapterId/
// bookId cleared) rather than being destroyed. Silent data loss on a
// structural delete would be a much worse failure mode than "where did
// my chapter go — oh, it's back in Unfiled."
async function deleteChapter(id) {
  const chapter = App.chapters[id];
  if (!chapter) return;
  const book = App.books[chapter.bookId];

  // Orphan this chapter's notes back to unfiled rather than deleting them.
  const affectedNotes = Object.values(App.noteSummaries).filter(n => n.chapterId === id);
  for (const n of affectedNotes) {
    const note = await NotesStore.get(n.id);
    if (note) {
      note.chapterId = null;
      note.updatedAt = Date.now();
      await NotesStore.set(n.id, note);
      App.noteSummaries[n.id] = { ...App.noteSummaries[n.id], chapterId: null };
      if (App.openNotes[n.id]) App.openNotes[n.id].chapterId = null;
    }
  }

  await NotesStore.deleteChapter(id);
  delete App.chapters[id];
  if (book) {
    book.chapterIds = book.chapterIds.filter(cid => cid !== id);
    book.updatedAt = Date.now();
    await NotesStore.setBook(book.id, book);
  }
  markDirty();
  renderNavTree();
  renderTabs(); // tab tooltips may reference the deleted chapter
}

async function deleteBook(id) {
  const book = App.books[id];
  if (!book) return;
  // Orphan every chapter's notes, then remove the chapters, then the book.
  for (const chapterId of [...book.chapterIds]) {
    await deleteChapter(chapterId); // handles note-orphaning per chapter
  }
  await NotesStore.deleteBook(id);
  delete App.books[id];
  markDirty();
  renderNavTree();
}

// moveNoteToChapter(noteId, chapterId|null, targetIndex) — the core of
// drag-and-drop for notes. chapterId null means "move to Unfiled."
async function moveNoteToChapter(noteId, chapterId, targetOrder) {
  const note = await NotesStore.get(noteId);
  if (!note) return;
  note.chapterId = chapterId;
  note.order = targetOrder;
  note.updatedAt = Date.now();
  await NotesStore.set(noteId, note);
  App.noteSummaries[noteId] = { id: noteId, title: note.title, chapterId, order: targetOrder, updatedAt: note.updatedAt };
  if (App.openNotes[noteId]) { App.openNotes[noteId].chapterId = chapterId; App.openNotes[noteId].order = targetOrder; }
  markDirty();
}

async function moveChapterToBook(chapterId, bookId, targetOrder) {
  const chapter = App.chapters[chapterId];
  if (!chapter) return;
  const oldBook = App.books[chapter.bookId];
  if (oldBook) {
    oldBook.chapterIds = oldBook.chapterIds.filter(id => id !== chapterId);
    await NotesStore.setBook(oldBook.id, oldBook);
  }
  chapter.bookId = bookId;
  chapter.order  = targetOrder;
  chapter.updatedAt = Date.now();
  await NotesStore.setChapter(chapterId, chapter);
  const newBook = App.books[bookId];
  if (newBook && !newBook.chapterIds.includes(chapterId)) {
    newBook.chapterIds.push(chapterId);
    await NotesStore.setBook(bookId, newBook);
  }
  markDirty();
}

async function reorderBook(bookId, targetOrder) {
  const book = App.books[bookId];
  if (!book) return;
  book.order = targetOrder;
  book.updatedAt = Date.now();
  await NotesStore.setBook(bookId, book);
  markDirty();
}

// ─── Nav panel: expand/collapse + open/closed + pinned state ───────
//
// Three concepts, deliberately kept distinct:
//   isPanelOpen()   — is the panel currently visible at all
//   isPinned()      — the user's STORED preference (pinned vs pop-out)
//   isPinnedActive() — whether pinned behavior actually applies right now,
//                      i.e. the stored preference AND the viewport is wide
//                      enough to honor it. Below NAV_PIN_MIN_WIDTH, pinned
//                      mode is overridden back to pop-out at runtime —
//                      WITHOUT mutating the stored preference. A Galaxy
//                      Fold 5 user gets pop-out on the ~370px outer screen
//                      and their real pinned layout back the instant they
//                      unfold to the wider inner screen; nothing about
//                      their saved choice is touched by the override.
//
// Pin and open are PARTIALLY linked: pinning opens the panel (a
// reasonable "make this visible and anchored" action), but unpinning
// does NOT close it — it only switches the open panel from claiming
// layout space to pop-out/overlay mode. Closing is always a separate,
// explicit action: the hamburger (which works identically regardless of
// pinned state) or clicking outside while in pop-out mode. There is no
// "pinned but closed" state, but "unpinned and open" is a perfectly
// normal, common state.
//
// Breakpoint rationale: 860px matches the documented Galaxy Fold 5 /
// tablet breakpoint already established in the Refectory stylesheet this
// auth/layout pattern was ported from — fold-open width is exactly the
// case where claiming a further 300px for a pinned panel starts being
// genuinely cramped rather than merely cozy.
const NAV_PIN_MIN_WIDTH = 860;

function isPanelOpen()  { return !!App.data.navState.panelOpen; }
function isPinned()     { return !!App.data.navState.pinned; }
function isPinnedActive() { return isPinned() && window.innerWidth >= NAV_PIN_MIN_WIDTH; }

function isBookExpanded(id)    { return App.data.navState.expandedBookIds.includes(id); }
function isChapterExpanded(id) { return App.data.navState.expandedChapterIds.includes(id); }

function setPanelOpen(open) {
  App.data.navState.panelOpen = open;
  saveLocal();
  applyNavPanelDOMState();
}

function setPinned(pinned) {
  App.data.navState.pinned = pinned;
  // Pinning still opens the panel (a reasonable "make this visible and
  // anchored" action), but unpinning no longer force-closes it. The panel
  // should stay open and simply switch from claiming layout space to
  // pop-out/overlay mode — closing is now ALWAYS a separate, explicit
  // action (the hamburger, or clicking outside in pop-out mode), never an
  // automatic side effect of changing the pin preference.
  if (pinned) App.data.navState.panelOpen = true;
  markDirty(); // pin preference is KV-synced, unlike pure ephemeral UI state
  applyNavPanelDOMState();
}

// applyNavPanelDOMState() — the single place that reconciles stored state
// + current viewport width into actual DOM classes. CSS can't read JS
// state directly, so this is the bridge: it runs on every state change
// AND on window resize, so crossing the NAV_PIN_MIN_WIDTH threshold while
// the page is open (e.g. unfolding a Fold 5) re-evaluates immediately
// rather than only at next load.
function applyNavPanelDOMState() {
  const panel = document.getElementById('nav-panel');
  const scrim = document.getElementById('nav-panel-scrim');
  const layout = document.querySelector('.main-layout');
  if (!panel || !layout) return;

  const open = isPanelOpen();
  const pinnedActive = isPinnedActive();

  panel.classList.toggle('open', open);
  layout.classList.toggle('nav-pinned', open && pinnedActive);
  // Scrim only makes sense in pop-out mode — pinned mode doesn't cover
  // anything, so there's nothing to dismiss-by-clicking-outside.
  if (scrim) scrim.style.display = (open && !pinnedActive) ? '' : 'none';

  const pinBtn = document.getElementById('nav-pin-btn');
  if (pinBtn) {
    const wideEnough = window.innerWidth >= NAV_PIN_MIN_WIDTH;
    pinBtn.style.display = wideEnough ? '' : 'none';
    pinBtn.classList.toggle('active', isPinned());
    pinBtn.title = isPinned() ? 'Unpin panel' : 'Pin panel';
  }
}

window.addEventListener('resize', applyNavPanelDOMState);

// The obscured viewer's rows reflow naturally on resize (each is sized
// by its own content, nothing pixel-matched to copy) — but the active/
// adjacent row DETECTION depends on getBoundingClientRect() positions,
// which do change on resize, so that needs a fresh recompute.
// Skipped while in keyboard navigation mode: syncObscuredViewerToPointer
// is the HOVER-follow path, driven by App._lastPointerY (the last known
// mouse/touch screen coordinate) — calling it on resize while keyboard
// mode is active would silently overwrite the keyboard-controlled
// active row with whatever row happens to sit under that stale
// coordinate, with no awareness that keyboard navigation should be the
// only thing moving the index right now. Confirmed bug: opening
// devtools (which resizes the viewport) was resetting keyboard-mode
// navigation back to an arbitrary low index every time.
window.addEventListener('resize', () => {
  if (App._cipherKeyboardMode) return;
  if (isCipherNote(App.noteSummaries[App.activeNoteId]) && !isIlluminated(App.activeNoteId)) {
    syncObscuredViewerToPointer(App.activeNoteId, App._lastPointerY);
  }
});

function setBookExpanded(id, expanded) {
  const list = App.data.navState.expandedBookIds;
  const i = list.indexOf(id);
  if (expanded && i === -1) list.push(id);
  if (!expanded && i !== -1) list.splice(i, 1);
  saveLocal();
}

function setChapterExpanded(id, expanded) {
  const list = App.data.navState.expandedChapterIds;
  const i = list.indexOf(id);
  if (expanded && i === -1) list.push(id);
  if (!expanded && i !== -1) list.splice(i, 1);
  saveLocal();
}

document.getElementById('nav-toggle-btn')?.addEventListener('click', () => {
  // The hamburger always toggles panel visibility, regardless of pinned
  // state. Pinning controls HOW the panel behaves when open (claims
  // layout space vs. overlays as a pop-out) — it was never meant to make
  // the panel impossible to temporarily hide. The earlier guard here
  // ("if pinned, do nothing") meant pinned mode had NO way to hide the
  // panel at all short of unpinning — a real usability gap, not a
  // deliberate restriction, since panelOpen and pinned are already
  // independent stored fields (see setPinned/isPanelOpen) and nothing
  // re-forces panelOpen back to match pinned except setPinned itself.
  setPanelOpen(!isPanelOpen());
});
document.getElementById('nav-panel-scrim')?.addEventListener('click', () => setPanelOpen(false));

// Backup outside-tap close: the scrim's bounds rely on .main-layout's
// height (calc(100vh - 57px)), which mobile browser chrome (URL bar
// collapsing/expanding) can make briefly inaccurate. This listens at the
// document level instead of depending on the scrim element's exact
// rendered bounds — closes the panel on any tap/click outside it,
// whenever it's open in pop-out (non-pinned) mode.
document.addEventListener('click', (e) => {
  if (!isPanelOpen() || isPinnedActive()) return;
  const panel = document.getElementById('nav-panel');
  const toggleBtn = document.getElementById('nav-toggle-btn');
  if (panel.contains(e.target) || toggleBtn?.contains(e.target)) return;
  setPanelOpen(false);
}, true);
document.getElementById('nav-pin-btn')?.addEventListener('click', () => setPinned(!isPinned()));

document.getElementById('nav-new-book-btn')?.addEventListener('click', async () => {
  const id = await createBook('Untitled Corpus');
  // Immediately offer to rename — a brand new corpus with no name yet is
  // the one moment an inline-rename prompt is welcome rather than intrusive.
  startInlineRename('book', id);
});

// ─── Loading the tree from IndexedDB ───────────────────────────────

// loadNavData() — populates App.books/App.chapters/App.noteSummaries from
// IndexedDB. Note summaries deliberately exclude `content` — the tree only
// ever needs id/title/chapterId/order/updatedAt to render, and pulling full
// note bodies into memory for every note just to draw the tree would scale
// badly for anyone with a large note collection.
async function loadNavData() {
  const [books, chapters, allNotes] = await Promise.all([
    NotesStore.getAllBooks(),
    NotesStore.getAllChapters(),
    NotesStore.getAll(),
  ]);
  App.books    = books;
  App.chapters = chapters;
  App.noteSummaries = {};
  for (const [id, note] of Object.entries(allNotes)) {
    App.noteSummaries[id] = {
      id, title: note.title, chapterId: note.chapterId ?? null,
      order: note.order || 0, updatedAt: note.updatedAt || 0,
      type: note.type || null, // null = plain Remnant; 'cipher' = Cipher
    };
  }
}

// ─── Inline rename (used for both new-book and new-chapter naming) ─

function startInlineRename(kind, id) {
  // Deferred to renderNavTree: after the next render, find the row's label
  // and swap it for a text input. Simpler than threading rename-mode state
  // through the render function itself for what's a rare, short-lived UI mode.
  App._pendingRename = { kind, id };
  renderNavTree();
}

function commitInlineRename(kind, id, value) {
  const name = (value || '').trim() || (kind === 'book' ? 'Untitled Corpus' : 'Untitled Scroll');
  if (kind === 'book') renameBook(id, name);
  else renameChapter(id, name);
}

// ─── Rendering ──────────────────────────────────────────────────────

// notePath(noteId) — returns "Corpus Name / Scroll Name" for a filed
// remnant, or "Loose Remnants" for one that isn't. Used for the tab
// hover tooltip.
function notePath(noteId) {
  const summary = App.noteSummaries[noteId];
  if (!summary || !summary.chapterId) return 'Loose Remnants';
  const chapter = App.chapters[summary.chapterId];
  if (!chapter) return 'Loose Remnants';
  const book = App.books[chapter.bookId];
  return book ? `${book.name} / ${chapter.name}` : chapter.name;
}

function noteTabLabel(note) {
  const t = (note?.title || '').trim();
  return t || 'Untitled Remnant';
}

function renderTabs() {
  const bar = document.getElementById('tab-bar');
  bar.innerHTML = '';

  App.data.tabState.openIds.forEach(id => {
    const note = App.openNotes[id];
    if (!note) return;
    const tab = document.createElement('div');
    tab.className = 'tab' + (id === App.activeNoteId ? ' active' : '');
    tab.title = notePath(id); // hover tooltip: which corpus/scroll this remnant lives in
    tab.innerHTML = `<span class="tab-label"></span><span class="tab-close">&times;</span>`;
    tab.querySelector('.tab-label').textContent = noteTabLabel(note);
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) {
        closeTab(id);
      } else {
        setActiveNote(id);
        renderTabs();
        revealNoteInNavTree(id); // clicking a tab also expands/highlights its spot in the nav
      }
    });
    bar.appendChild(tab);
  });

  // Cipher tabs render after Remnant tabs, same combined bar. Pulled from
  // App.openCipherIds — never App.data.tabState — so this list is purely
  // in-memory for this session, matching everything else about how
  // Cipher tab state stays outside what gets persisted/synced.
  App.openCipherIds.forEach(id => {
    const summary = App.noteSummaries[id];
    if (!summary) return;
    const illuminated = isIlluminated(id);
    const tab = document.createElement('div');
    tab.className = 'tab tab-cipher' + (illuminated ? ' tab-cipher-illuminated' : '') + (id === App.activeNoteId ? ' active' : '');
    tab.title = notePath(id);
    // Static key icon, not an open/closed lock — illuminate state is
    // already shown elsewhere (the red border on the editor + the
    // warning banner), so this icon doesn't need to track it too.
    tab.innerHTML = `<img class="tab-cipher-icon" src="${NAV_ICON_CIPHER}" alt="" title="Cipher" /><span class="tab-label"></span><span class="tab-close">&times;</span>`;
    tab.querySelector('.tab-label').textContent = summary.title?.trim() || 'Untitled Cipher';
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) {
        closeTab(id);
      } else {
        openCipherInTab(id); // re-checks unlocked/session-cache state, not just setActiveNote
        renderTabs();
        revealNoteInNavTree(id);
      }
    });
    bar.appendChild(tab);
  });

  const newTab = document.createElement('div');
  newTab.className = 'tab-new';
  newTab.textContent = '+';
  newTab.title = 'New remnant';
  newTab.addEventListener('click', () => createNote());
  bar.appendChild(newTab);
}

// ─── Nav tree rendering ─────────────────────────────────────────────
//
// Tree shape (user-facing terms — internal identifiers/classes/dataset
// values stay 'book'/'chapter'/'note' throughout the codebase; only
// display copy uses Corpus/Scroll/Remnant):
//   Corpus (sorted by order)
//     "+ New Scroll" row — always first, pinned, regardless of how many
//      scrolls already exist (so it's never something you have to scroll
//      past everything else to find)
//     Scroll (sorted by order)
//       "+ New Remnant" row — always first under an expanded scroll, same
//        pinning rationale as New Scroll
//       Remnant (sorted by order)
//   "Loose Remnants" — always rendered, even when empty, so it reads as
//    a real, permanent part of the structure rather than a vanishing edge case

function sortByOrder(arr) {
  return [...arr].sort((a, b) => (a.order || 0) - (b.order || 0));
}

function renderNavTree() {
  const treeEl = document.getElementById('nav-tree');
  treeEl.innerHTML = '';

  const books = sortByOrder(Object.values(App.books));
  books.forEach(book => treeEl.appendChild(buildBookRow(book)));

  // Unfiled Notes — a view over notes with chapterId === null, not a
  // Book/Chapter record. Always rendered, even with zero notes in it.
  treeEl.appendChild(buildUnfiledSection());
}

function buildBookRow(book) {
  const wrap = document.createElement('div');
  wrap.className = 'nav-book-wrap';

  const row = document.createElement('div');
  row.className = 'nav-row nav-row-book' + (App._pendingRename?.kind === 'book' && App._pendingRename.id === book.id ? '' : '');
  row.dataset.kind = 'book';
  row.dataset.id = book.id;
  row.draggable = true;

  const expanded = isBookExpanded(book.id);
  row.innerHTML = `
    <span class="nav-row-caret${expanded ? ' expanded' : ''}">▸</span>
    <img class="nav-row-icon" src="${NAV_ICON_CORPUS}" alt="" />
    <span class="nav-row-label"></span>
    <span class="nav-row-actions">
      <span class="nav-row-action-btn" data-action="delete-book" title="Delete corpus">🗑</span>
    </span>
  `;

  if (App._pendingRename?.kind === 'book' && App._pendingRename.id === book.id) {
    renderInlineRenameInput(row, 'book', book.id, book.name);
  } else {
    row.querySelector('.nav-row-label').textContent = book.name;
  }

  row.addEventListener('click', (e) => {
    if (e.target.closest('[data-action]')) return; // handled separately below
    if (App._pendingRename) return; // don't toggle while renaming
    setBookExpanded(book.id, !expanded);
    renderNavTree();
  });

  row.querySelector('[data-action="delete-book"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`Delete "${book.name}"? Scrolls and remnants inside will move to Loose Remnants.`)) {
      deleteBook(book.id);
    }
  });

  row.addEventListener('dblclick', () => startInlineRename('book', book.id));

  attachDragHandlers(row, { kind: 'book', id: book.id, containerKind: 'root', containerId: null });

  wrap.appendChild(row);

  if (expanded) {
    const childWrap = document.createElement('div');
    childWrap.className = 'nav-book-children';

    // Pinned "+ New Scroll" row — always first, before any real scroll.
    const addRow = document.createElement('div');
    addRow.className = 'nav-row nav-row-chapter nav-row-add';
    addRow.innerHTML = `<span class="nav-row-caret placeholder">·</span><span class="nav-row-label">+ New Scroll</span>`;
    addRow.addEventListener('click', async () => {
      const id = await createChapter(book.id, 'Untitled Scroll');
      if (id) startInlineRename('chapter', id);
    });
    childWrap.appendChild(addRow);

    const chapters = sortByOrder(Object.values(App.chapters).filter(c => c.bookId === book.id));
    chapters.forEach(chapter => childWrap.appendChild(buildChapterRow(chapter)));

    attachContainerDropHandlers(childWrap, { kind: 'chapter-list', bookId: book.id });
    wrap.appendChild(childWrap);
  }

  return wrap;
}

function buildChapterRow(chapter) {
  const wrap = document.createElement('div');
  wrap.className = 'nav-chapter-wrap';

  const row = document.createElement('div');
  row.className = 'nav-row nav-row-chapter';
  row.dataset.kind = 'chapter';
  row.dataset.id = chapter.id;
  row.draggable = true;

  const expanded = isChapterExpanded(chapter.id);
  row.innerHTML = `
    <span class="nav-row-caret${expanded ? ' expanded' : ''}">▸</span>
    <img class="nav-row-icon" src="${NAV_ICON_SCROLL}" alt="" />
    <span class="nav-row-label"></span>
    <span class="nav-row-actions">
      <span class="nav-row-action-btn" data-action="delete-chapter" title="Delete scroll">🗑</span>
    </span>
  `;

  if (App._pendingRename?.kind === 'chapter' && App._pendingRename.id === chapter.id) {
    renderInlineRenameInput(row, 'chapter', chapter.id, chapter.name);
  } else {
    row.querySelector('.nav-row-label').textContent = chapter.name;
  }

  row.addEventListener('click', (e) => {
    if (e.target.closest('[data-action]')) return;
    if (App._pendingRename) return;
    setChapterExpanded(chapter.id, !expanded);
    renderNavTree();
  });

  row.querySelector('[data-action="delete-chapter"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`Delete "${chapter.name}"? Remnants inside will move to Loose Remnants.`)) {
      deleteChapter(chapter.id);
    }
  });

  row.addEventListener('dblclick', () => startInlineRename('chapter', chapter.id));

  attachDragHandlers(row, { kind: 'chapter', id: chapter.id, containerKind: 'book', containerId: chapter.bookId });

  wrap.appendChild(row);

  if (expanded) {
    const childWrap = document.createElement('div');
    childWrap.className = 'nav-chapter-children';

    // Pinned "+ New Remnant" row — always first under an expanded scroll.
    const addRow = document.createElement('div');
    addRow.className = 'nav-row nav-row-note nav-row-add';
    addRow.innerHTML = `<span class="nav-row-caret placeholder">·</span><span class="nav-row-label">+ New Remnant</span>`;
    addRow.addEventListener('click', () => createNote(chapter.id));
    childWrap.appendChild(addRow);

    // Pinned "+ New Cipher" row — second, right after New Remnant.
    const addCipherRow = document.createElement('div');
    addCipherRow.className = 'nav-row nav-row-note nav-row-add';
    addCipherRow.innerHTML = `<span class="nav-row-caret placeholder">·</span><span class="nav-row-label">+ New Cipher</span>`;
    addCipherRow.addEventListener('click', () => openCipherCreateModal(chapter.id));
    childWrap.appendChild(addCipherRow);

    const notes = sortByOrder(Object.values(App.noteSummaries).filter(n => n.chapterId === chapter.id));
    if (!notes.length) {
      const hint = document.createElement('div');
      hint.className = 'nav-empty-hint';
      hint.textContent = 'No remnants yet';
      childWrap.appendChild(hint);
    }
    notes.forEach(note => childWrap.appendChild(buildNoteRow(note)));

    attachContainerDropHandlers(childWrap, { kind: 'note-list', chapterId: chapter.id });
    wrap.appendChild(childWrap);
  }

  return wrap;
}

function buildNoteRow(noteSummary) {
  const isCipher = isCipherNote(noteSummary);
  const row = document.createElement('div');
  row.className = 'nav-row nav-row-note' + (isCipher ? ' nav-row-cipher' : '') + (noteSummary.id === App.activeNoteId ? ' active' : '');
  row.dataset.kind = 'note';
  row.dataset.id = noteSummary.id;
  row.draggable = true;
  row.innerHTML = `
    <span class="nav-row-caret placeholder">·</span>
    <img class="nav-row-icon" src="${isCipher ? NAV_ICON_CIPHER : NAV_ICON_REMNANT}" alt="" />
    <span class="nav-row-label"></span>
    <span class="nav-row-actions">
      <span class="nav-row-action-btn" data-action="delete-note" title="${isCipher ? 'Delete cipher' : 'Delete remnant'}">🗑</span>
    </span>
  `;
  row.querySelector('.nav-row-label').textContent = noteSummary.title?.trim() || (isCipher ? 'Untitled Cipher' : 'Untitled Remnant');
  row.addEventListener('click', (e) => {
    if (e.target.closest('[data-action]')) return; // handled separately below
    if (isCipher) openCipherInTab(noteSummary.id);
    else openNoteInTab(noteSummary.id);
  });

  row.querySelector('[data-action="delete-note"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const label = noteSummary.title?.trim() || (isCipher ? 'Untitled Cipher' : 'Untitled Remnant');
    const warning = isCipher
      ? `Delete "${label}"? This Cipher's encrypted content will be permanently deleted — there is no way to recover it afterward, even with the correct passphrase.`
      : `Delete "${label}"? This cannot be undone.`;
    if (confirm(warning)) {
      deleteNote(noteSummary.id);
    }
  });

  attachDragHandlers(row, {
    kind: 'note', id: noteSummary.id,
    containerKind: 'chapter', containerId: noteSummary.chapterId,
  });

  return row;
}

function buildUnfiledSection() {
  const wrap = document.createElement('div');
  wrap.className = 'nav-unfiled-wrap';

  const header = document.createElement('div');
  header.className = 'nav-row nav-row-unfiled-header';
  header.innerHTML = `<span class="nav-row-label">Loose Remnants</span>`;
  wrap.appendChild(header);

  const childWrap = document.createElement('div');
  childWrap.className = 'nav-unfiled-children';

  const notes = sortByOrder(Object.values(App.noteSummaries).filter(n => !n.chapterId));
  if (!notes.length) {
    const hint = document.createElement('div');
    hint.className = 'nav-empty-hint';
    hint.textContent = 'Nothing unfiled';
    childWrap.appendChild(hint);
  }
  notes.forEach(note => childWrap.appendChild(buildNoteRow(note)));

  attachContainerDropHandlers(childWrap, { kind: 'note-list', chapterId: null });
  wrap.appendChild(childWrap);
  return wrap;
}

// renderInlineRenameInput(row, kind, id, currentName) — swaps a row's label
// span for a text input, focused and selected, committing on blur or Enter,
// cancelling on Escape. Used for both brand-new books/chapters (auto-
// triggered) and double-click-to-rename on existing ones.
function renderInlineRenameInput(row, kind, id, currentName) {
  const labelEl = row.querySelector('.nav-row-label');
  const input = document.createElement('input');
  input.className = 'input nav-rename-input';
  input.value = currentName;
  labelEl.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    App._pendingRename = null;
    commitInlineRename(kind, id, input.value);
  };
  const cancel = () => {
    if (committed) return;
    committed = true;
    App._pendingRename = null;
    renderNavTree();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
}

// revealNoteInNavTree(noteId) — expands the book/chapter containing this
// note (if any) and highlights its row. Called whenever a note becomes the
// active tab, whether by clicking an existing tab or opening a new one,
// so the nav panel always shows "you are here."
function revealNoteInNavTree(noteId) {
  const summary = App.noteSummaries[noteId];
  if (summary?.chapterId) {
    const chapter = App.chapters[summary.chapterId];
    if (chapter) {
      setChapterExpanded(chapter.id, true);
      setBookExpanded(chapter.bookId, true);
    }
  }
  renderNavTree();
  // Scroll the now-highlighted row into view if the panel is open.
  requestAnimationFrame(() => {
    document.querySelector(`.nav-row-note.active`)?.scrollIntoView({ block: 'nearest' });
  });
}

// ─── Drag and drop ──────────────────────────────────────────────────
//
// Three draggable kinds (book, chapter, note), each constrained to valid
// targets only:
//   book    → reorder among other books (root level only)
//   chapter → reorder within its book, OR move to a different book
//   note    → reorder within its chapter/Unfiled, OR move to a different
//             chapter or to/from Unfiled
//
// Two drop affordances per row, chosen by cursor position within the row:
//   top third / bottom third → insertion line (reorder before/after this row)
//   middle third             → "drop into" highlight (move INTO this row's
//                               container — only valid when the row is a
//                               container itself: a book accepts a chapter
//                               dropped on it, a chapter accepts a note)
//
// Self-drop and drop-into-own-descendant are rejected by construction:
// canDropOn() below is the single gate every drop passes through.

function attachDragHandlers(rowEl, meta) {
  rowEl.addEventListener('dragstart', (e) => {
    App.drag = meta;
    rowEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires setData to be called for drag to initiate at all.
    e.dataTransfer.setData('text/plain', meta.id);
  });
  rowEl.addEventListener('dragend', () => {
    rowEl.classList.remove('dragging');
    clearDropIndicators();
    App.drag = null;
  });

  rowEl.addEventListener('dragover', (e) => {
    if (!App.drag) return;
    const target = { kind: rowEl.dataset.kind, id: rowEl.dataset.id };
    const zone = dropZoneFor(e, rowEl, App.drag, target);
    if (!zone) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    showDropIndicator(rowEl, zone);
  });

  rowEl.addEventListener('dragleave', () => {
    rowEl.classList.remove('drop-line-above', 'drop-line-below', 'drop-target-into');
  });

  rowEl.addEventListener('drop', (e) => {
    if (!App.drag) return;
    const target = { kind: rowEl.dataset.kind, id: rowEl.dataset.id };
    const zone = dropZoneFor(e, rowEl, App.drag, target);
    if (!zone) return;
    e.preventDefault();
    e.stopPropagation();
    performDrop(App.drag, target, zone);
    clearDropIndicators();
  });
}

// attachContainerDropHandlers — lets a note/chapter be dropped into an
// otherwise-empty (or end-of-list) container, not just onto a sibling row.
// Without this, the only way to move a note into a chapter with zero notes
// already in it would be... nowhere to drop it.
function attachContainerDropHandlers(containerEl, containerMeta) {
  containerEl.addEventListener('dragover', (e) => {
    if (!App.drag) return;
    if (!containerAccepts(App.drag, containerMeta)) return;
    // Only claim this if the event didn't already land on a child row
    // (rows call stopPropagation in their own drop handler, but dragover
    // bubbles, so check we're not hovering a specific row's middle/edge zones).
    if (e.target.closest('.nav-row')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    containerEl.classList.add('drop-target-into');
  });
  containerEl.addEventListener('dragleave', (e) => {
    if (e.target === containerEl) containerEl.classList.remove('drop-target-into');
  });
  containerEl.addEventListener('drop', (e) => {
    if (!App.drag) return;
    if (e.target.closest('.nav-row')) return; // a row already handled it
    if (!containerAccepts(App.drag, containerMeta)) return;
    e.preventDefault();
    containerEl.classList.remove('drop-target-into');
    performContainerDrop(App.drag, containerMeta);
  });
}

function containerAccepts(drag, containerMeta) {
  if (containerMeta.kind === 'chapter-list') return drag.kind === 'chapter' || false; // chapters only reorder within their own book's list via row drops; cross-book chapter moves land on the BOOK row itself, not the empty list area
  if (containerMeta.kind === 'note-list')    return drag.kind === 'note';
  return false;
}

async function performContainerDrop(drag, containerMeta) {
  if (containerMeta.kind === 'note-list' && drag.kind === 'note') {
    const siblings = Object.values(App.noteSummaries).filter(n => n.chapterId === containerMeta.chapterId && n.id !== drag.id);
    const order = nextOrder(siblings);
    await moveNoteToChapter(drag.id, containerMeta.chapterId, order);
    renderNavTree();
    renderTabs();
  }
}

// dropZoneFor(e, rowEl, drag, target) — returns 'above' | 'below' | 'into'
// | null (null = not a valid drop here at all). Position within the row
// determines above/below vs into; canDropOn() determines validity.
function dropZoneFor(e, rowEl, drag, target) {
  if (!canDropOn(drag, target)) return null;
  const rect = rowEl.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const third = rect.height / 3;
  // "Into" only makes sense when the target is a container the dragged
  // item could actually live inside (a chapter for a note, a book for a
  // chapter). Same-kind drags (note-on-note, chapter-on-chapter, book-on-
  // book) are always reorder-only — there's no "into" for a sibling.
  const intoValid = (drag.kind === 'note' && target.kind === 'chapter')
                  || (drag.kind === 'chapter' && target.kind === 'book');
  if (intoValid && y > third && y < third * 2) return 'into';
  return y < rect.height / 2 ? 'above' : 'below';
}

// canDropOn(drag, target) — the single validity gate. Rejects self-drop,
// drop-into-own-descendant, and cross-kind drops that don't make sense
// (e.g. a book dropped onto a note).
function canDropOn(drag, target) {
  if (drag.id === target.id && drag.kind === target.kind) return false; // no self-drop

  if (drag.kind === 'book')    return target.kind === 'book';
  if (drag.kind === 'chapter') return target.kind === 'chapter' || target.kind === 'book';
  if (drag.kind === 'note')    return target.kind === 'note' || target.kind === 'chapter';
  return false;
}

function showDropIndicator(rowEl, zone) {
  clearDropIndicators();
  if (zone === 'into')  rowEl.classList.add('drop-target-into');
  if (zone === 'above') rowEl.classList.add('drop-line-above');
  if (zone === 'below') rowEl.classList.add('drop-line-below');
}

function clearDropIndicators() {
  document.querySelectorAll('.drop-line-above, .drop-line-below, .drop-target-into')
    .forEach(el => el.classList.remove('drop-line-above', 'drop-line-below', 'drop-target-into'));
}

// performDrop(drag, target, zone) — the actual data mutation once a valid
// drop is confirmed. Reorders use the target's siblings' order values to
// compute a new order for the dragged item; moves additionally change the
// dragged item's parent (chapterId/bookId).
async function performDrop(drag, target, zone) {
  if (drag.kind === 'note')    return performNoteDrop(drag, target, zone);
  if (drag.kind === 'chapter') return performChapterDrop(drag, target, zone);
  if (drag.kind === 'book')    return performBookDrop(drag, target, zone);
}

// computeInsertOrder(siblings, targetId, zone) — siblings is the full
// sorted sibling list of the container the item is landing in (NOT
// excluding the target), targetId is the row being dropped on, zone is
// 'above'/'below'. Returns a numeric order placing the dragged item
// adjacent to the target on the requested side, leaving room between
// existing siblings rather than requiring a full renumber on every drag.
function computeInsertOrder(siblings, targetId, zone) {
  const sorted = sortByOrder(siblings);
  const idx = sorted.findIndex(s => s.id === targetId);
  if (idx === -1) return nextOrder(sorted);
  const targetOrder = sorted[idx].order || 0;
  if (zone === 'above') {
    const prevOrder = idx > 0 ? (sorted[idx - 1].order || 0) : targetOrder - 2;
    return (prevOrder + targetOrder) / 2;
  } else {
    const nextSib = sorted[idx + 1];
    const afterOrder = nextSib ? (nextSib.order || 0) : targetOrder + 2;
    return (targetOrder + afterOrder) / 2;
  }
}

async function performNoteDrop(drag, target, zone) {
  if (target.kind === 'chapter' && zone === 'into') {
    const siblings = Object.values(App.noteSummaries).filter(n => n.chapterId === target.id);
    await moveNoteToChapter(drag.id, target.id, nextOrder(siblings));
  } else if (target.kind === 'note') {
    const targetSummary = App.noteSummaries[target.id];
    const siblings = Object.values(App.noteSummaries).filter(n => n.chapterId === targetSummary.chapterId);
    const order = computeInsertOrder(siblings, target.id, zone);
    await moveNoteToChapter(drag.id, targetSummary.chapterId, order);
  } else {
    return;
  }
  renderNavTree();
  renderTabs();
}

async function performChapterDrop(drag, target, zone) {
  if (target.kind === 'book' && zone === 'into') {
    const siblings = Object.values(App.chapters).filter(c => c.bookId === target.id);
    await moveChapterToBook(drag.id, target.id, nextOrder(siblings));
  } else if (target.kind === 'chapter') {
    const targetChapter = App.chapters[target.id];
    const siblings = Object.values(App.chapters).filter(c => c.bookId === targetChapter.bookId);
    const order = computeInsertOrder(siblings, target.id, zone);
    await moveChapterToBook(drag.id, targetChapter.bookId, order);
  } else {
    return;
  }
  renderNavTree();
}

async function performBookDrop(drag, target, zone) {
  if (target.kind !== 'book') return;
  const siblings = Object.values(App.books);
  const order = computeInsertOrder(siblings, target.id, zone);
  await reorderBook(drag.id, order);
  renderNavTree();
}

// updateCipherControlsVisibility(id) — shows/hides the Illuminate button,
// Obscure button, illuminated border, warning banner, and switches
// between the textarea (illuminated) and the read-only obscured viewer
// (not illuminated), based on whether the active tab is a Cipher at all.
// Called from every renderActiveNote() exit path so these stay correct
// regardless of which branch (no tab / Cipher / plain Remnant) is active.
function updateCipherControlsVisibility(id) {
  const editorEl      = document.getElementById('note-editor');
  const illuminateBtn = document.getElementById('cipher-illuminate-btn');
  const obscureBtn     = document.getElementById('cipher-obscure-btn');
  const bannerEl       = document.getElementById('cipher-illuminate-banner');
  const viewerEl       = document.getElementById('cipher-obscured-viewer');
  const bodyEl         = document.getElementById('note-body-input');

  const isCipher = id && isCipherNote(App.noteSummaries[id]);
  const illuminated = isCipher && isIlluminated(id);
  const unlocked = isCipher && !!App.unlockedCiphers[id];

  illuminateBtn.style.display = (isCipher && !illuminated) ? '' : 'none';
  obscureBtn.style.display    = illuminated ? '' : 'none';
  bannerEl.style.display      = illuminated ? '' : 'none';
  editorEl.classList.toggle('illuminated', !!illuminated);
  document.getElementById('note-title-input').placeholder = isCipher ? 'Untitled cipher' : 'Untitled remnant';

  // Exactly one of {textarea, viewer} is visible at a time for a Cipher.
  // Illuminated -> textarea (full plaintext, editable). Unlocked-but-
  // obscured -> the read-only viewer (nothing decrypted except whatever
  // row the cursor is currently over). A plain Remnant always uses the
  // textarea, same as before.
  const showViewer = isCipher && unlocked && !illuminated;
  viewerEl.style.display = showViewer ? '' : 'none';
  bodyEl.style.display   = showViewer ? 'none' : '';
}

function renderActiveNote() {
  const titleEl = document.getElementById('note-title-input');
  const bodyEl  = document.getElementById('note-body-input');
  const id      = App.activeNoteId;
  const summary = id ? App.noteSummaries[id] : null;

  updateCipherControlsVisibility(id);

  if (!id || !summary) {
    titleEl.value = '';
    bodyEl.value  = '';
    titleEl.disabled = true;
    bodyEl.disabled  = true;
    bodyEl.placeholder = 'Open a remnant, or click "+" to start a new one…';
    App._bodyShowingNoteId = null;
    return;
  }

  if (isCipherNote(summary)) {
    const unlocked = App.unlockedCiphers[id];
    if (!unlocked) {
      // Shouldn't normally happen — a Cipher only becomes active via
      // openCipherInTab, which always unlocks (or prompts) first. Guard
      // anyway rather than show a stale/wrong body.
      titleEl.value = summary.title || '';
      titleEl.disabled = false;
      bodyEl.value = '';
      bodyEl.disabled = true;
      bodyEl.placeholder = 'Locked.';
      App._bodyShowingNoteId = null;
      return;
    }
    titleEl.disabled = false;
    titleEl.value = summary.title || '';

    if (isIlluminated(id)) {
      // Illuminated: textarea, full plaintext, editable — same as before.
      bodyEl.disabled = false;
      bodyEl.placeholder = 'Start writing…';
      if (App._bodyShowingNoteId !== id) {
        bodyEl.value = unlocked.plaintext || '';
        App._bodyShowingNoteId = id;
      }
    } else {
      // Obscured: the read-only viewer. Built from the ENCRYPTED line
      // array's metadata (count) — no decryption happens just to render
      // the viewer's structure. unlocked.plaintext is null here by
      // design (see the "Ciphers" section header) and is never read.
      App._bodyShowingNoteId = null; // textarea isn't showing this id's content right now
      renderCipherObscuredViewer(id);
    }
    return;
  }

  const note = App.openNotes[id];
  if (!note) {
    titleEl.value = '';
    bodyEl.value  = '';
    titleEl.disabled = true;
    bodyEl.disabled  = true;
    bodyEl.placeholder = 'Open a remnant, or click "+" to start a new one…';
    App._bodyShowingNoteId = null;
    return;
  }
  titleEl.disabled = false;
  bodyEl.disabled  = false;
  bodyEl.placeholder = 'Start writing…';
  titleEl.value = note.title || '';
  if (App._bodyShowingNoteId !== id) {
    bodyEl.value = note.content || '';
    App._bodyShowingNoteId = id;
  }
}

// ─── Cipher obscured viewer: per-line decrypt-on-demand ────────────
//
// Read-only. Shown whenever a Cipher is unlocked but NOT illuminated.
// Built as one real <div> row per ENCRYPTED line (note.encrypted.lines)
// — row count and therefore scroll height are known immediately from
// that array's length, with ZERO decryption needed just to lay out the
// viewer. This is the actual structural fix for the wrap-mismatch bugs
// chased earlier today: there's no second text layer trying to
// reproduce anything's wrapping, because at rest there's no text at all
// in most rows — just a sand-texture placeholder div with no characters
// for a browser to lay out incorrectly.
//
// Decryption happens ONLY for the row currently under the cursor
// (mouse or touch), via Cipher.decryptLineWithKey — and the decrypted
// text is DISCARDED (the row's real-text div is cleared) the moment the
// cursor moves to a different row. This is genuine per-line decrypt-on-
// demand: at any moment, only the active row's plaintext exists in
// memory at all, not a slice/mask of an already-fully-decrypted string.

let cipherViewerRowCount = 0;
let cipherViewerActiveRowIndex = -1;
let cipherViewerDecryptToken = 0; // incremented on every row change, so a slow in-flight decrypt for a row the cursor has already left can detect it's stale and discard its own result instead of writing into the wrong row

function renderCipherObscuredViewer(id) {
  const viewerEl = document.getElementById('cipher-obscured-viewer');
  if (viewerEl.style.display === 'none') return;

  runWithCipherNote(id, (note) => {
    const lineCount = note?.encrypted?.lines?.length || 0;
    viewerEl.innerHTML = '';
    for (let i = 0; i < lineCount; i++) {
      const row = document.createElement('div');
      row.className = 'cipher-obscured-row';
      row.dataset.lineIndex = i;
      row.innerHTML = `
        <div class="cipher-obscured-row-sand"></div>
        <div class="cipher-obscured-row-real"></div>
      `;
      viewerEl.appendChild(row);
    }
    cipherViewerRowCount = lineCount;
    cipherViewerActiveRowIndex = -1;
    // Re-sync via whichever mode is actually controlling the reveal right
    // now — don't assume hover-follow just because that's the default;
    // if keyboard mode happens to still be active when this rebuilds
    // (defensive: currently nothing calls this while keyboard mode is on,
    // but this shouldn't depend on that staying true elsewhere), restore
    // the reveal via keyboard navigation instead of overwriting it with
    // a hover-based guess from a possibly-stale pointer coordinate.
    if (App._cipherKeyboardMode) {
      navigateCipherKeyboardRow(id, 0);
    } else {
      syncObscuredViewerToPointer(id, App._lastPointerY);
    }
  });
}

// runWithCipherNote — small helper since renderCipherObscuredViewer
// needs the note record (for encrypted.lines.length) but isn't itself
// async-friendly to call from every render path; fires the callback
// once the note is fetched. Synchronous callers just don't get a
// return value, which is fine here since rendering is fire-and-forget.
function runWithCipherNote(id, callback) {
  NotesStore.get(id).then(note => { if (App.activeNoteId === id) callback(note); });
}

function lineHeightPx() {
  const viewerEl = document.getElementById('cipher-obscured-viewer');
  const lh = parseFloat(getComputedStyle(viewerEl).lineHeight);
  return Number.isFinite(lh) ? lh : 24;
}

// syncObscuredViewerToPointer(id, clientY) — determines which ROW the
// pointer is over (by measured position, same approach as before) and
// activates exactly that row, deactivating whichever was active before.
function syncObscuredViewerToPointer(id, clientY) {
  if (clientY == null) return;
  const viewerEl = document.getElementById('cipher-obscured-viewer');
  if (viewerEl.style.display === 'none') return;

  const rows = viewerEl.querySelectorAll('.cipher-obscured-row');
  if (!rows.length) return;
  const lh = lineHeightPx();

  const tops = Array.from(rows).map(r => Math.round(r.getBoundingClientRect().top));
  let hoveredIdx = 0;
  for (let i = 0; i < tops.length; i++) {
    if (clientY >= tops[i] - lh / 2 && clientY < tops[i] + lh / 2) { hoveredIdx = i; break; }
    if (clientY < tops[i]) { hoveredIdx = Math.max(0, i - 1); break; }
    hoveredIdx = i;
  }

  rows.forEach((row, i) => {
    row.classList.toggle('adjacent', i === hoveredIdx - 1 || i === hoveredIdx + 1);
  });

  if (hoveredIdx === cipherViewerActiveRowIndex) return; // no change, nothing to (de/re)activate

  const prevIdx = cipherViewerActiveRowIndex;
  cipherViewerActiveRowIndex = hoveredIdx;
  const myToken = ++cipherViewerDecryptToken;

  if (prevIdx >= 0) deactivateRow(rows[prevIdx]);
  activateRow(id, rows[hoveredIdx], hoveredIdx, myToken);
}

async function activateRow(id, rowEl, lineIndex, token) {
  const unlocked = App.unlockedCiphers[id];
  if (!unlocked) return;
  const note = await NotesStore.get(id);
  if (!note?.encrypted?.lines?.[lineIndex]) return;

  let text;
  try {
    text = await Cipher.decryptLineWithKey(unlocked.key, note.encrypted.lines[lineIndex]);
  } catch (e) {
    console.error('[Remnant] Failed to decrypt line for obscured viewer:', e);
    return;
  }

  // The cursor may have already moved on to a different row while this
  // decrypt was in flight (decryptLineWithKey is async — a fast mouse
  // movement across several rows can easily outrun one decrypt call).
  // If a newer activation has started since this one began, THIS
  // result is stale: discard it rather than writing decrypted text
  // into a row the cursor isn't even on anymore, and rather than
  // letting a slow result clobber a newer/correct one.
  if (token !== cipherViewerDecryptToken) return;
  // Also bail if this exact row got deactivated in the meantime (e.g.
  // the user scrolled away) even without the row index itself changing.
  if (!rowEl.isConnected) return;

  const realEl = rowEl.querySelector('.cipher-obscured-row-real');
  realEl.textContent = text;
  rowEl.classList.add('active');
}

function deactivateRow(rowEl) {
  if (!rowEl) return;
  rowEl.classList.remove('active');
  // This is the actual "discard from memory" step — clearing
  // textContent removes the decrypted string from the DOM/render tree.
  // The underlying JS string becomes unreachable once nothing else
  // references it, eligible for garbage collection on the engine's own
  // schedule (see cipher.js's broader notes on what "discard" can and
  // cannot guarantee in JS — there's no hard zero-out, but this closes
  // the window of EXPOSURE/REFERENCE as tightly as the language allows).
  const realEl = rowEl.querySelector('.cipher-obscured-row-real');
  if (realEl) realEl.textContent = '';
}

// Mobile touch offset: the reveal window sits ABOVE the touch point on
// mobile, not under it — a finger on the glass would otherwise cover
// the one area that's actually legible. Fixed pixel offset so it stays
// predictable regardless of zoom/viewport size.
const TOUCH_REVEAL_OFFSET_PX = 48;

function attachCipherObscuredViewerTracking() {
  const viewerEl = document.getElementById('cipher-obscured-viewer');
  if (!viewerEl) return;

  // Throttled to once per animation frame — measuring every row's
  // getBoundingClientRect() on every raw event is the same kind of cost
  // that caused mobile scroll jank in the earlier overlay design.
  let frameQueued = false;
  function queueSync(y) {
    App._lastPointerY = y;
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(() => {
      frameQueued = false;
      // Respects keyboard mode HERE, once, rather than requiring every
      // caller (mousemove, touchmove, scroll, resize) to remember to
      // check separately. Confirmed bug from exactly this gap: the
      // scrollIntoView call inside keyboard navigation itself triggers
      // a 'scroll' event on the viewer, which called this same sync
      // path, which would immediately overwrite the index keyboard
      // navigation had just set — on EVERY single arrow-key press.
      if (App._cipherKeyboardMode) return;
      if (isCipherNote(App.noteSummaries[App.activeNoteId]) && !isIlluminated(App.activeNoteId)) {
        syncObscuredViewerToPointer(App.activeNoteId, App._lastPointerY);
      }
    });
  }

  // Keyboard navigation mode (desktop): click anywhere in the viewer to
  // enter a locked reveal mode controlled by arrow keys instead of mouse
  // position. Mouse movement is deliberately IGNORED while active — this
  // is a genuinely separate mode, not a temporary override, so a stray
  // mouse twitch doesn't silently kick you back to hover-follow. Escape
  // exits back to normal hover-follow with everything re-obscured.
  viewerEl.addEventListener('mousemove', (e) => queueSync(e.clientY));

  viewerEl.addEventListener('click', () => {
    // Keyboard navigation mode is desktop-only. Below this width, a tap
    // synthesizes a native 'click' event the same as a real click would
    // — so without this gate, simply tapping into the viewer to start a
    // drag-to-reveal gesture was silently locking into keyboard mode,
    // with no way out (Escape is the only exit, and there's no Escape
    // key on a touchscreen). 860px matches the same desktop-class width
    // threshold already used elsewhere in this app (see
    // NAV_PIN_MIN_WIDTH) — not because this is the same feature, but
    // because it's the established line this app already draws between
    // "desktop-shaped layout" and "phone/tablet," and keyboard
    // navigation specifically assumes a real keyboard is attached.
    if (window.innerWidth < 860) return;
    if (isIlluminated(App.activeNoteId)) return;
    enterCipherKeyboardMode();
  });

  viewerEl.addEventListener('touchmove', (e) => {
    if (!e.touches?.length) return;
    const y = e.touches[0].clientY;
    queueSync(y - TOUCH_REVEAL_OFFSET_PX);
    updateTouchEdgeAutoScroll(viewerEl, y);
  }, { passive: true });
  viewerEl.addEventListener('touchend', stopTouchEdgeAutoScroll);
  viewerEl.addEventListener('touchcancel', stopTouchEdgeAutoScroll);

  // Native scroll — the viewer is a real scroll container with real
  // per-row content height, so scrolling just works; only the active-
  // row DETECTION needs a refresh as rows move under the (stationary,
  // during a scroll) pointer position. (Also correctly a no-op during
  // keyboard mode, via queueSync's own guard above — including the
  // scroll events keyboard navigation's own scrollIntoView triggers.)
  viewerEl.addEventListener('scroll', () => queueSync(App._lastPointerY), { passive: true });
}

// ─── Touch edge auto-scroll ─────────────────────────────────────────
//
// While dragging (touchmove) near the top or bottom edge of the viewer,
// auto-scroll the document in that direction, scaled by how deep into
// the edge zone the finger is — shallow into the zone scrolls slowly,
// right at the very edge scrolls faster. Moving back out of the zone
// (without lifting the finger) stops it immediately. This exists
// because on touch, "drag to scroll" and "drag to reveal" are the same
// physical gesture and were fighting each other; this turns them into
// one continuous motion instead of two competing ones.
const EDGE_ZONE_FRACTION = 0.18; // top/bottom 18% of the viewer's height
const EDGE_SCROLL_MAX_PX_PER_FRAME = 14;

let edgeScrollDirection = 0; // -1 up, 0 none, 1 down
let edgeScrollSpeed = 0;
let edgeScrollRAF = null;

function updateTouchEdgeAutoScroll(viewerEl, touchClientY) {
  const rect = viewerEl.getBoundingClientRect();
  const zoneSize = rect.height * EDGE_ZONE_FRACTION;
  const distanceFromTop    = touchClientY - rect.top;
  const distanceFromBottom = rect.bottom - touchClientY;

  // Quadratic easing (progress²) rather than linear — linear reaches a
  // meaningful fraction of max speed almost immediately upon entering
  // the trigger zone, which read as an abrupt snap-on rather than a
  // gradual ramp. Squaring keeps speed low through most of the zone and
  // only ramps up sharply right at the very edge of the viewport, which
  // is what actually reads as "slow to fast" rather than "off to on."
  if (distanceFromBottom < zoneSize) {
    edgeScrollDirection = 1;
    const progress = 1 - Math.max(0, distanceFromBottom) / zoneSize;
    edgeScrollSpeed = EDGE_SCROLL_MAX_PX_PER_FRAME * progress * progress;
  } else if (distanceFromTop < zoneSize) {
    edgeScrollDirection = -1;
    const progress = 1 - Math.max(0, distanceFromTop) / zoneSize;
    edgeScrollSpeed = EDGE_SCROLL_MAX_PX_PER_FRAME * progress * progress;
  } else {
    edgeScrollDirection = 0;
  }

  if (edgeScrollDirection !== 0 && !edgeScrollRAF) {
    const step = () => {
      if (edgeScrollDirection === 0) { edgeScrollRAF = null; return; }
      viewerEl.scrollTop += edgeScrollDirection * edgeScrollSpeed;
      edgeScrollRAF = requestAnimationFrame(step);
    };
    edgeScrollRAF = requestAnimationFrame(step);
  }
}

function stopTouchEdgeAutoScroll() {
  edgeScrollDirection = 0;
  if (edgeScrollRAF) { cancelAnimationFrame(edgeScrollRAF); edgeScrollRAF = null; }
}

// ─── Keyboard navigation mode ───────────────────────────────────────
//
// Click anywhere in the obscured viewer to enter: reveals the TOP row
// (not wherever you clicked), then Up/Down arrows move the reveal one
// row at a time, scrolling it into view as needed. Escape exits back
// to normal hover-follow, fully re-obscuring everything. Mouse movement
// is ignored for the duration — this is a deliberately separate,
// locked mode, not a temporary hover override.

function enterCipherKeyboardMode() {
  const id = App.activeNoteId;
  if (!id || isIlluminated(id)) return;
  if (window.innerWidth < 860) return; // desktop-only — see the click listener's comment for why
  App._cipherKeyboardMode = true;
  document.getElementById('cipher-obscured-viewer')?.classList.add('keyboard-mode');
  cipherViewerActiveRowIndex = -1; // force activateRow to actually run for row 0, even if it was already hover-active
  navigateCipherKeyboardRow(id, 0);
  document.addEventListener('keydown', handleCipherKeyboardNav);
}

function exitCipherKeyboardMode() {
  App._cipherKeyboardMode = false;
  document.getElementById('cipher-obscured-viewer')?.classList.remove('keyboard-mode');
  document.removeEventListener('keydown', handleCipherKeyboardNav);
  const viewerEl = document.getElementById('cipher-obscured-viewer');
  const rows = viewerEl?.querySelectorAll('.cipher-obscured-row');
  if (rows && cipherViewerActiveRowIndex >= 0 && rows[cipherViewerActiveRowIndex]) {
    deactivateRow(rows[cipherViewerActiveRowIndex]);
  }
  rows?.forEach(r => r.classList.remove('adjacent'));
  cipherViewerActiveRowIndex = -1;
}

function navigateCipherKeyboardRow(id, newIndex) {
  const viewerEl = document.getElementById('cipher-obscured-viewer');
  const rows = viewerEl?.querySelectorAll('.cipher-obscured-row');
  if (!rows?.length) return;
  const clamped = Math.max(0, Math.min(rows.length - 1, newIndex));
  if (clamped === cipherViewerActiveRowIndex) return;

  const prevIdx = cipherViewerActiveRowIndex;
  cipherViewerActiveRowIndex = clamped;
  const myToken = ++cipherViewerDecryptToken;

  if (prevIdx >= 0 && rows[prevIdx]) deactivateRow(rows[prevIdx]);
  rows.forEach((row, i) => row.classList.toggle('adjacent', i === clamped - 1 || i === clamped + 1));
  activateRow(id, rows[clamped], clamped, myToken);
  // Native scrollIntoView, not custom scroll-distance math. Plain
  // Remnants get correct, natural-feeling keyboard scrolling for free
  // from the browser's own textarea behavior — no custom code at all.
  // An earlier custom margin/overflow formula here was the actual
  // source of a real bug (it kept yanking scrollTop backward toward 0
  // for rows that were already comfortably visible near the top of an
  // unscrolled viewer, looking like navigation was looping back to the
  // start instead of advancing). Letting the browser handle this the
  // same way it already handles it correctly for Remnants removes that
  // whole class of self-inflicted bug.
  rows[clamped].scrollIntoView({ block: 'center' });
}

function handleCipherKeyboardNav(e) {
  if (!App._cipherKeyboardMode) return;
  const id = App.activeNoteId;
  if (e.key === 'ArrowDown') { e.preventDefault(); navigateCipherKeyboardRow(id, cipherViewerActiveRowIndex + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); navigateCipherKeyboardRow(id, cipherViewerActiveRowIndex - 1); }
  else if (e.key === 'Escape') { e.preventDefault(); exitCipherKeyboardMode(); }
}
attachCipherObscuredViewerTracking();

function scheduleSaveActive() {
  if (isCipherNote(App.noteSummaries[App.activeNoteId])) scheduleSaveActiveCipher();
  else scheduleSaveActiveNote();
}
document.getElementById('note-title-input')?.addEventListener('input', scheduleSaveActive);
document.getElementById('note-body-input')?.addEventListener('input', scheduleSaveActive);
document.getElementById('scratchpad-input')?.addEventListener('input', scheduleSaveScratchpad);

// Mobile pop-out toggle. No-op on desktop (button is CSS-hidden there,
// but harmless if clicked since the column is already always visible).
function setScratchpadOpen(open) {
  document.getElementById('scratchpad-column')?.classList.toggle('open', open);
}
document.getElementById('scratchpad-toggle-btn')?.addEventListener('click', () => setScratchpadOpen(true));
document.getElementById('scratchpad-close-btn')?.addEventListener('click', () => setScratchpadOpen(false));
document.getElementById('scratchpad-scrim')?.addEventListener('click', () => setScratchpadOpen(false));

async function renderAll() {
  // Rehydrate open tabs from IndexedDB
  const ids = App.data.tabState.openIds || [];
  for (const id of ids) {
    const note = await NotesStore.get(id);
    if (note) App.openNotes[id] = note;
  }
  // Drop any tab ids that no longer resolve to a note (e.g. deleted elsewhere)
  App.data.tabState.openIds = ids.filter(id => App.openNotes[id]);
  App.activeNoteId = App.data.tabState.activeId && App.openNotes[App.data.tabState.activeId]
    ? App.data.tabState.activeId
    : (App.data.tabState.openIds[0] || null);
  App.data.tabState.activeId = App.activeNoteId;

  await loadNavData();
  renderNavTree();
  applyNavPanelDOMState();

  renderTabs();
  renderActiveNote();
  await loadScratchpad();
  updateSyncIndicator();
  updateSaveSessionVisibility();
  updateLastSyncedLabel();
}

// ─── Settings modal ─────────────────────────────────────────────────

function openSettingsModal() {
  const d = App.data;
  document.getElementById('settings-firstname-input').value = d.firstName || '';
  document.getElementById('settings-lastname-input').value  = d.lastName  || '';
  document.getElementById('settings-username-input').value  = d.username  || '';
  const workerEl = document.getElementById('settings-worker-url');
  if (workerEl) workerEl.value = d.workerUrl || '';

  Auth.renderSettingsSection();
  updateLastSyncedLabel();
  openModal('modal-settings');
}

function saveSettingsProfileFields() {
  App.data.firstName = document.getElementById('settings-firstname-input').value.trim();
  App.data.lastName  = document.getElementById('settings-lastname-input').value.trim();
  App.data.username  = document.getElementById('settings-username-input').value.trim();
  const workerEl = document.getElementById('settings-worker-url');
  if (workerEl) App.data.workerUrl = workerEl.value.trim().replace(/\/+$/, '');
  saveLocal();
}

document.getElementById('open-settings-btn')?.addEventListener('click', openSettingsModal);
document.getElementById('settings-close-btn')?.addEventListener('click', () => {
  saveSettingsProfileFields();
  closeModal('modal-settings');
  updateSaveSessionVisibility();
  updateSyncIndicator();
});

// Terminology modal — purely informational, no state to save on close.
document.getElementById('terminology-link-btn')?.addEventListener('click', () => openModal('modal-terminology'));
document.getElementById('terminology-close-btn')?.addEventListener('click', () => closeModal('modal-terminology'));

document.getElementById('settings-sync-now-btn')?.addEventListener('click', async () => {
  const ok = await pushToWorker();
  showToast(ok ? 'Synced ✓' : 'Sync failed — check your connection');
});

document.getElementById('settings-token-copy')?.addEventListener('click', () => {
  const token = App.data?.userToken || '';
  navigator.clipboard.writeText(token).then(() => {
    const btn = document.getElementById('settings-token-copy');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  }).catch(() => showToast('Select the token above and copy manually.'));
});

document.getElementById('settings-token-change')?.addEventListener('click', () => {
  closeModal('modal-settings');
  Auth.showSetupLoadToken();
});

document.getElementById('settings-upgrade-google-btn')?.addEventListener('click', () => {
  closeModal('modal-settings');
  Auth.showGoogleUpgradeFlow();
});

document.getElementById('settings-account-btn')?.addEventListener('click', () => {
  closeModal('modal-settings');
  if (Auth.isGuest())             Auth.showSetupFresh();
  else if (Auth.isTokenAccount()) Auth.showGoogleUpgradeFlow();
  else                             Auth.showGuestSwitchConfirm();
});

// ─── Auth callbacks ─────────────────────────────────────────────────

async function onSignedIn(data, isNew) {
  // If the incoming data carries notes/structure/scratchpad (it came straight
  // off a KV pull elsewhere in auth.js, e.g. handleGoogleCredential or the
  // load-existing-token flow), route that content into IndexedDB now rather
  // than leaving it stranded on the plain metadata object.
  const { notes, structure, scratchpad, ...metadata } = data || {};
  App.data = mergeData(metadata);
  if (notes || structure || scratchpad) {
    await Promise.all([
      notes ? NotesStore.replaceAll(notes) : Promise.resolve(),
      structure?.books    ? NotesStore.replaceAllBooks(structure.books)       : Promise.resolve(),
      structure?.chapters ? NotesStore.replaceAllChapters(structure.chapters) : Promise.resolve(),
      scratchpad ? NotesStore.setScratchpad(scratchpad.content || '') : Promise.resolve(),
    ]);
  }
  saveLocal();
  await renderAll();
  showToast(isNew ? 'Welcome to Remnant 📜' : 'Welcome back — syncing your remnants…');
  pushToWorker();
}

async function onGuestReady(data) {
  App.data = mergeData(data);
  saveLocal();
  await renderAll();
}

// ─── Boot ───────────────────────────────────────────────────────────

async function fetchGoogleClientId() {
  const base = getWorkerUrl().replace(/\/+$/, '');
  if (!base) return '';
  try {
    const res = await fetch(`${base}/auth/config`);
    if (!res.ok) return '';
    const data = await res.json();
    return data.googleClientId || '';
  } catch { return ''; }
}

async function boot() {
  const stored = ls.get(STORAGE_KEY);
  App.data     = stored ? mergeData(stored) : defaultData();

  // First-run default: open AND pinned on wide viewports (a desktop-sized
  // window has room to spare, and a pinned tree reads as part of the
  // workspace rather than a transient overlay); closed on narrow ones (a
  // notes tool's primary space should be the page being written, especially
  // on a phone-width screen). Uses the same NAV_PIN_MIN_WIDTH threshold as
  // the runtime pinned-mode override, so the first-run choice and the
  // ongoing responsive behavior agree on what counts as "wide enough."
  // Only applied when there's no stored preference yet — a returning
  // user's explicit choice always wins over this default.
  if (!stored) {
    const wide = window.innerWidth >= NAV_PIN_MIN_WIDTH;
    App.data.navState.panelOpen = wide;
    App.data.navState.pinned    = wide;
  }

  const googleClientId = await fetchGoogleClientId();

  Auth.init({
    googleClientId,
    storageKey:        STORAGE_KEY,
    storageAuthKey:    STORAGE_AUTH_KEY,
    storageDismissKey: STORAGE_DISMISS_KEY,
    workerBase:        getWorkerUrl,
    getData:           () => App.data,
    setData:           (d) => { App.data = d; saveLocal(); },
    mergeData,
    onSignedIn,
    onGuestReady,
    onSessionExpired:  () => {},
    pushToWorker,
    startSyncPing,
    openModal,
    closeModal,
    toast:             showToast,
    appName:           'Remnant',
    appEmoji:          '📜',
  });

  // New user — show account setup wizard
  if (!stored) {
    await renderAll();
    Auth.showAccountSetup();
    return;
  }

  // Existing session — pull from worker if configured, merge with local.
  // Local edits win on conflict (per-record updatedAt), same spirit as the
  // Refectory pattern, applied to notes AND structure (books/chapters)
  // across the IndexedDB/localStorage split rather than a single object.
  const tokenBeforePull = App.data.userToken;
  if (getWorkerUrl()) {
    const remote = await pullFromWorker();
    if (remote) {
      const { notes: remoteNotes, structure: remoteStructure, scratchpad: remoteScratchpad, ...metadata } = remote;

      const mergeByUpdatedAt = async (remoteObj, localObj) => {
        const merged = { ...(remoteObj || {}) };
        for (const [id, localRec] of Object.entries(localObj || {})) {
          const remoteRec = merged[id];
          if (!remoteRec || (localRec.updatedAt || 0) >= (remoteRec.updatedAt || 0)) {
            merged[id] = localRec;
          }
        }
        return merged;
      };

      const [localNotes, localBooks, localChapters] = await Promise.all([
        NotesStore.getAll(), NotesStore.getAllBooks(), NotesStore.getAllChapters(),
      ]);

      const mergedNotes    = await mergeByUpdatedAt(remoteNotes, localNotes);
      const mergedBooks    = await mergeByUpdatedAt(remoteStructure?.books, localBooks);
      const mergedChapters = await mergeByUpdatedAt(remoteStructure?.chapters, localChapters);

      App.data = mergeData(metadata);
      await Promise.all([
        NotesStore.replaceAll(mergedNotes),
        NotesStore.replaceAllBooks(mergedBooks),
        NotesStore.replaceAllChapters(mergedChapters),
      ]);

      const localPad  = await NotesStore.getScratchpad();
      const remotePad  = remoteScratchpad;
      // Scratchpad has no per-id merge target — newest updatedAt wins outright.
      if (remotePad && (!localPad || (remotePad.updatedAt || 0) > (localPad.updatedAt || 0))) {
        await NotesStore.setScratchpad(remotePad.content || '');
      }
      saveLocal();
    }
  }

  const ok = await Auth.bootCheck(tokenBeforePull);
  if (!ok) return;

  await renderAll();
  if (!Auth.isGuest()) startSyncPing();
  // Catch up on a sync immediately if we crossed the threshold while away.
  maybeSync();
}

// Auth's guest-switch-confirm flow (showGuestSwitchConfirm in auth.js)
// only clears localStorage — it has no knowledge of IndexedDB, since the
// ported module's original host app kept all account data in one
// localStorage blob. Remnant's note/book/chapter CONTENT lives in
// IndexedDB, so without this, "switch account" would clear the guest's
// profile metadata but silently leave all their notes behind to reappear
// under the next account. Attached on the capture phase, and re-attached
// every time the wizard re-renders this screen (auth.js rebuilds the
// button fresh via innerHTML each time setupScreen runs), so this always
// fires — and finishes — before auth.js's own bubble-phase handler calls
// location.reload().
document.addEventListener('click', (e) => {
  if (e.target?.id === 'auth-btn-guest-switch-confirm') {
    NotesStore.clear(); // best-effort; not awaited — a reload is about to
                         // happen regardless, and IndexedDB writes that are
                         // in-flight when a page reloads still commit.
  }
}, true); // capture phase — runs before auth.js's bubble-phase listener

document.addEventListener('DOMContentLoaded', boot);
