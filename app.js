'use strict';

const DEFAULT_MS = 5 * 60 * 1000;
const STEP_MS = 5 * 60 * 1000;

const $ = (sel) => document.querySelector(sel);
const els = {
  text: $('#card-text'),
  cycle: $('#btn-cycle'),
  pin: $('#btn-pin'),
  fav: $('#btn-fav'),
  toast: $('#toast'),
  toastLink: $('#toast-link'),
  toastClose: $('#toast-close'),
  dot: $('.dot'),
  play: $('#btn-play'),
  add: $('#btn-add'),
  time: $('#time'),
};

// store, today(), loadThoughts() and the favourites helpers live in common.js.

// ---------- Cards ----------

let thoughts = [];
let index = 0;

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Draws from a shuffled deck of ids kept in storage, so every card is seen
// once before any repeats. `avoidId` (default: the last card drawn, possibly
// in another tab) stops a fresh deck from starting with that same card.
function drawIndex(avoidId = store.get('lastId')) {
  const known = new Set(thoughts.map((t) => t.id));
  let deck = (store.get('deck') || []).filter((id) => known.has(id));
  if (!deck.length) {
    deck = shuffle([...known]);
    if (deck.length > 1 && deck[deck.length - 1] === avoidId) deck.unshift(deck.pop());
  }
  const id = deck.pop();
  store.set('deck', deck);
  store.set('lastId', id);
  return thoughts.findIndex((t) => t.id === id);
}

function pickInitialIndex() {
  store.remove('position'); // left over from the old one-card-per-day behaviour

  const pin = store.get('pin');
  if (pin && pin.date === today()) {
    const i = thoughts.findIndex((t) => t.id === pin.id);
    if (i !== -1) return i;
  }
  if (pin) store.remove('pin'); // stale pin from a previous day

  return drawIndex();
}

function isPinned(thought) {
  const pin = store.get('pin');
  return !!pin && pin.date === today() && pin.id === thought.id;
}

let swapTimer = null;

function render({ animate = false } = {}) {
  // Reads thoughts[index] when it runs, so a delayed swap always shows the latest card.
  const apply = () => {
    const t = thoughts[index];
    els.text.textContent = t.text;
    els.pin.setAttribute('aria-pressed', String(isPinned(t)));
    els.pin.title = isPinned(t) ? 'Unpin' : 'Pin for today';
    const fav = isFavourite(t.id);
    els.fav.setAttribute('aria-pressed', String(fav));
    els.fav.title = fav ? 'Remove from favourites' : 'Save to favourites';
  };

  if (!animate) return apply();
  // Rapid clicks restart the fade instead of queuing overlapping swaps.
  clearTimeout(swapTimer);
  els.text.classList.add('swapping');
  swapTimer = setTimeout(() => {
    apply();
    els.text.classList.remove('swapping');
  }, 400);
}

function cycle() {
  if (thoughts.length < 2) return;
  index = drawIndex(thoughts[index].id);
  render({ animate: true });
}

function togglePin() {
  const t = thoughts[index];
  if (isPinned(t)) store.remove('pin');
  else store.set('pin', { id: t.id, date: today() });
  render();
}

// ---------- Favourites ----------

let toastTimer = null;

function showToast(id) {
  els.toastLink.href = `favourites.html?id=${encodeURIComponent(id)}`;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 6000);
}

function hideToast() {
  clearTimeout(toastTimer);
  els.toast.hidden = true;
}

function toggleFav() {
  const t = thoughts[index];
  if (isFavourite(t.id)) {
    removeFavourite(t.id);
    hideToast();
  } else {
    addFavourite(t.id);
    showToast(t.id);
  }
  render();
}

// ---------- Gong (synthesised with Web Audio — no audio file needed) ----------

let audioCtx = null;

// Must be called from a user gesture (the play button) so the browser allows audio later.
function unlockAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playGong() {
  if (!audioCtx) return;
  const ctx = audioCtx;
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);

  // Inharmonic partials like a singing bowl; a slightly detuned twin on each gives the slow "wah" beating.
  const base = 196;
  const partials = [
    { ratio: 1.0,  gain: 1.0,  decay: 9 },
    { ratio: 2.71, gain: 0.55, decay: 6 },
    { ratio: 5.12, gain: 0.25, decay: 3.5 },
    { ratio: 8.33, gain: 0.12, decay: 2 },
  ];

  for (const p of partials) {
    for (const detune of [0, 1.8]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = base * p.ratio + detune;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(p.gain * 0.5, now + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + p.decay + 0.1);
    }
  }

  // Short filtered noise burst for the mallet strike.
  const len = Math.floor(ctx.sampleRate * 0.05);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const noise = ctx.createBufferSource();
  const lp = ctx.createBiquadFilter();
  const ng = ctx.createGain();
  noise.buffer = buf;
  lp.type = 'lowpass';
  lp.frequency.value = 1200;
  ng.gain.value = 0.25;
  noise.connect(lp).connect(ng).connect(master);
  noise.start(now);
}

// ---------- Timer ----------
// Tracks an absolute end time rather than counting ticks, so the display stays
// accurate. The end itself is a single one-shot timeout: Chrome throttles a
// repeating interval in a hidden tab to once a minute, which would delay the
// gong, but a lone timeout only drifts by about a second.

const timer = {
  remaining: DEFAULT_MS,
  endAt: 0,
  running: false,
  intervalId: null,
  finishId: null,
};

function scheduleFinish() {
  clearTimeout(timer.finishId);
  timer.finishId = setTimeout(finish, Math.max(0, timer.endAt - Date.now()));
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function currentRemaining() {
  return timer.running ? timer.endAt - Date.now() : timer.remaining;
}

function renderTime() {
  els.time.textContent = formatTime(currentRemaining());
}

function setRunning(running) {
  timer.running = running;
  document.body.classList.toggle('running', running);
  document.body.classList.toggle('faded', running);
  els.play.setAttribute('aria-label', running ? 'Pause timer' : 'Start timer');
}

function start() {
  unlockAudio();
  timer.endAt = Date.now() + timer.remaining;
  setRunning(true);
  timer.intervalId = setInterval(tick, 250);
  scheduleFinish();
  renderTime();
}

function pause() {
  timer.remaining = Math.max(0, timer.endAt - Date.now());
  clearInterval(timer.intervalId);
  clearTimeout(timer.finishId);
  setRunning(false);
  renderTime();
}

function tick() {
  if (currentRemaining() <= 0) finish();
  else renderTime();
}

function finish() {
  if (!timer.running) return; // tick and the one-shot timeout can both arrive
  clearInterval(timer.intervalId);
  clearTimeout(timer.finishId);
  setRunning(false);
  timer.remaining = DEFAULT_MS;
  renderTime();

  playGong();
  els.dot.classList.remove('reverb');
  void els.dot.offsetWidth; // restart the animation if it was already applied
  els.dot.classList.add('reverb');
}

function addFive() {
  if (timer.running) {
    timer.endAt += STEP_MS;
    scheduleFinish();
  } else {
    timer.remaining += STEP_MS;
  }
  renderTime();
}

// ---------- Wire up ----------

els.dot.addEventListener('animationend', (e) => {
  if (e.animationName === 'reverb') els.dot.classList.remove('reverb');
});

els.cycle.addEventListener('click', cycle);
els.pin.addEventListener('click', togglePin);
els.fav.addEventListener('click', toggleFav);
els.toastClose.addEventListener('click', hideToast);
els.play.addEventListener('click', () => (timer.running ? pause() : start()));
els.add.addEventListener('click', addFive);

// Space toggles the timer when no button has focus.
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !(document.activeElement instanceof HTMLButtonElement)) {
    e.preventDefault();
    timer.running ? pause() : start();
  }
});

renderTime();

loadThoughts()
  .then((list) => {
    thoughts = list;
    if (!thoughts.length) throw new Error('no thoughts');
    index = pickInitialIndex();
    render();
  })
  .catch(() => {
    els.text.textContent = 'Be still, and know.';
    els.cycle.disabled = true;
    els.pin.disabled = true;
    els.fav.disabled = true;
  });
