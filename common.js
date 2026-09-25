'use strict';

// Shared by newtab.html and favourites.html (same origin, so they share localStorage).

// ---------- Storage (wrapped: localStorage can throw in some contexts) ----------

const store = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

// Local calendar date, so the pin releases at the user's midnight rather than UTC's.
function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function loadThoughts() {
  const res = await fetch('blessings.json');
  const data = await res.json();
  return data.thoughts;
}

// ---------- Favourites: [{ id, savedAt }], newest first ----------

function getFavourites() {
  const list = store.get('favourites');
  return Array.isArray(list) ? list : [];
}

function isFavourite(id) {
  return getFavourites().some((f) => f.id === id);
}

function addFavourite(id) {
  if (isFavourite(id)) return;
  store.set('favourites', [{ id, savedAt: new Date().toISOString() }, ...getFavourites()]);
}

function removeFavourite(id) {
  store.set('favourites', getFavourites().filter((f) => f.id !== id));
}

// ---------- Journals: { [id]: { text, updatedAt } } ----------
// Kept when a contemplation is un-hearted, so notes come back if it's hearted again.

function getJournal(id) {
  const all = store.get('journals');
  return (all && all[id]) || null;
}

function setJournal(id, text) {
  const all = store.get('journals') || {};
  if (text.trim()) all[id] = { text, updatedAt: new Date().toISOString() };
  else delete all[id];
  store.set('journals', all);
}

function shortDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
