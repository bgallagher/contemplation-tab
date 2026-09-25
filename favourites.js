'use strict';

const SAVE_DELAY_MS = 600;
const HEART_PATH = 'M12 20s-7-4.6-7-9.5A3.8 3.8 0 0 1 12 6a3.8 3.8 0 0 1 7 4.5C19 15.4 12 20 12 20z';

const $ = (sel) => document.querySelector(sel);
const els = {
  count: $('#fav-count'),
  list: $('#fav-list'),
  empty: $('#fav-empty'),
  detail: $('#detail'),
  detailEmpty: $('#detail-empty'),
  text: $('#detail-text'),
  meta: $('#detail-meta'),
  status: $('#save-status'),
  journal: $('#journal'),
};

let byId = new Map();  // thought id → thought
let selected = null;   // selected thought id
let saveTimer = null;

// Favourites that still exist in blessings.json, newest first.
function items() {
  return getFavourites().filter((f) => byId.has(f.id));
}

function metaFor(fav) {
  const j = getJournal(fav.id);
  return j ? `Journalled · ${shortDate(j.updatedAt)}` : `Saved ${shortDate(fav.savedAt)}`;
}

// ---------- Journal autosave ----------

function setStatus(saving) {
  els.status.textContent = saving ? 'Saving…' : '✓ Auto-saved';
  els.status.classList.toggle('saving', saving);
}

function flush() {
  if (saveTimer === null || !selected) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  setJournal(selected, els.journal.value);
  setStatus(false);
  // Update only this card's label. Rebuilding the list here would swap out the
  // button being clicked (blur fires on mousedown), and the click would be lost.
  const fav = items().find((f) => f.id === selected);
  const meta = els.list.querySelector(`li[data-id="${CSS.escape(selected)}"] .card-meta`);
  if (fav && meta) meta.textContent = metaFor(fav);
}

els.journal.addEventListener('input', () => {
  setStatus(true);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, SAVE_DELAY_MS);
});
els.journal.addEventListener('blur', flush);
window.addEventListener('pagehide', flush);

// ---------- Rendering ----------

function renderList() {
  const favs = items();
  els.count.textContent = favs.length === 1 ? '1 contemplation saved' : `${favs.length} contemplations saved`;
  els.empty.hidden = favs.length > 0;
  els.list.hidden = favs.length === 0;

  els.list.replaceChildren(...favs.map((fav) => {
    const li = document.createElement('li');
    li.className = 'fav-card' + (fav.id === selected ? ' selected' : '');
    li.dataset.id = fav.id;

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'fav-pick';
    pick.setAttribute('aria-current', String(fav.id === selected));
    pick.textContent = byId.get(fav.id).text;
    pick.addEventListener('click', () => select(fav.id));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'round fav-remove';
    remove.title = 'Remove from favourites';
    remove.setAttribute('aria-label', 'Remove from favourites');
    remove.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="heart-fill" d="${HEART_PATH}"/></svg>`;
    remove.addEventListener('click', () => unfavourite(fav.id));

    const meta = document.createElement('p');
    meta.className = 'card-meta';
    meta.textContent = metaFor(fav);

    li.append(pick, remove, meta);
    return li;
  }));
}

function renderDetail() {
  const fav = items().find((f) => f.id === selected);
  els.detail.hidden = !fav;
  els.detailEmpty.hidden = !!fav;
  if (!fav) return;

  const t = byId.get(fav.id);
  els.text.textContent = t.text;
  els.meta.textContent = `Saved ${shortDate(fav.savedAt)}`;
  const j = getJournal(fav.id);
  els.journal.value = j ? j.text : '';
  els.status.textContent = j ? '✓ Auto-saved' : '';
  els.status.classList.remove('saving');
}

function select(id) {
  flush();
  selected = id;
  const url = new URL(location.href);
  if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
  history.replaceState(null, '', url);
  renderList();
  renderDetail();
}

function unfavourite(id) {
  flush();
  const favs = items();
  const i = favs.findIndex((f) => f.id === id);
  removeFavourite(id); // journal is kept on purpose
  if (id === selected) {
    const rest = favs.filter((f) => f.id !== id);
    const next = rest[Math.min(i, rest.length - 1)];
    select(next ? next.id : null);
  } else {
    renderList();
  }
}

// ---------- Start ----------

loadThoughts()
  .then((list) => {
    byId = new Map(list.map((t) => [t.id, t]));
    const favs = items();
    const wanted = new URLSearchParams(location.search).get('id');
    const initial = favs.find((f) => f.id === wanted) || favs[0];
    select(initial ? initial.id : null);
    if (initial && wanted === initial.id) els.journal.focus();
  })
  .catch(() => {
    els.count.textContent = '';
    els.empty.hidden = false;
    els.list.hidden = true;
  });
