# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"still." — a Chrome MV3 extension that replaces the new tab page with a minimalist meditation page: a Brahma Kumaris contemplation, a breathing orb to focus on, a meditation timer that ends with a gong, and a favourites page with a private journal. Product requirements are in `MVP PRD.pdf`. The UI design lives in a Claude Design canvas: https://claude.ai/artifact/LXpYyVzbgoQ1WjBky5C7JR (boards: new tab desktop/mobile, favourites & journal).

## Running it

There is no build step, package manager, linter or test suite. It is plain HTML/CSS/JS loaded as classic `<script>` tags.

- **As the extension:** `chrome://extensions` → Developer mode → Load unpacked → this folder. Reload the extension after edits.
- **In a browser tab:** `python3 -m http.server` from this folder, then open `/newtab.html` or `/favourites.html`. Opening the files via `file://` won't work, because `fetch('blessings.json')` is blocked there. `manifest.json` is ignored in this mode, so the same files also work as a static website.
- **Syntax check:** `node --check <file>.js`.
- **Headless verification:** Chrome's `--screenshot` with `--virtual-time-budget` tends to hang on these pages (the orb runs an infinite animation, and redirect-based localStorage seeding also hangs). Instead, drive `--headless=new --remote-debugging-port=…` over CDP from a small Node script: `Page.navigate`, `Runtime.evaluate` to seed or inspect `localStorage` and page globals, `Input.dispatchMouseEvent` for real clicks, `Page.captureScreenshot`. Node's built-in `WebSocket`/`fetch` are enough, with no dependencies.

## Architecture

- **Two pages, shared globals.** `newtab.html` loads `common.js` then `app.js`; `favourites.html` loads `common.js` then `favourites.js`. `common.js` defines the globals both pages use: `store` (try/catch-wrapped localStorage JSON), `today()` (local-time `YYYY-MM-DD`), `loadThoughts()`, the favourites/journal helpers and `shortDate()`. Keep scripts as non-module classic scripts and keep load order.
- **All state is localStorage**, shared by both pages (same extension origin):
  - `pin` `{id, date}`: valid only while `date === today()`; stale pins are removed on load.
  - `deck` `[id…]` and `lastId`: a shuffled deck, so every new tab and every "New contemplation" click draws a different card, all cards before any repeat. A pinned card overrides the draw for that day.
  - `favourites` `[{id, savedAt}]`: newest first.
  - `journals` `{id: {text, updatedAt}}`: deliberately **not** deleted when a favourite is removed, so notes return if it's re-hearted. Empty text deletes the entry.
- **Timer (`app.js`).** It stores an absolute `endAt` and uses a 250 ms interval only for the display. The finish is a separate one-shot `setTimeout` (`scheduleFinish`), because Chrome throttles repeating intervals in hidden tabs to once a minute and that would delay the gong. `start`, `pause`, `addFive` and `finish` must keep that timeout in sync; `finish()` guards against running twice.
- **Gong** is synthesised with Web Audio (`playGong`), with no audio file. The `AudioContext` is created or resumed in `start()` because browsers only allow audio after a user gesture.
- **Fade while meditating:** `body.faded` drops every `.fadeable` element to 5% opacity (the PRD asks for "barely visible"); the orb is not `.fadeable`. The timer area regains some opacity on hover/focus so it can be paused.
- **Visibility is toggled with the `hidden` attribute**, backed by a global `[hidden] { display: none !important; }` in `style.css`. Without it, class `display` rules override `hidden`.
- **Orb animation** scales the whole element via `transform` only, with a static `box-shadow` glow. Animating the shadow itself caused visible flicker.
- **Favourites journal autosave** debounces 600 ms and flushes on blur, `pagehide` and card switch. `flush()` updates only the current card's meta label in place. Rebuilding the list there swaps out the button mid-click (blur fires on mousedown) and loses the click.

## Content: `blessings.json`

- Shape: `{meta, thoughts: [{id, text, date, date_label, lang, source, attribution}]}`. Keep `meta.count`, `meta.status` and `meta.duplicate_ids` updated when adding entries.
- `id` = first 12 hex chars of SHA-256 over the text lower-cased with whitespace collapsed to single spaces. Verify existing ids still reproduce before appending.
- **Text is verbatim** from shivbabas.org's English "Thought for Today" JPGs: keep original typos, capitalisation and curly quotes/apostrophes (`’ “ ”`); line breaks in the image become single spaces.
- Source: monthly posts like `https://www.shivbabas.org/post/thought-for-today-<month>-2026` link images at `https://files.shivbabas.org/wp-content/uploads/<day>-<month>-2026-thought[-today]-English.jpg`. The naming varies, and some pages link only some days, so probe the pattern for the rest. There's no OCR tool installed; transcribe by reading the images.
- Current coverage: June 1–September 17, 2026, except June 13 and August 30, which aren't published.
- The UI calls these **"contemplations"** (never "blessing"), though the file keeps the name `blessings.json`. Attribution and date are stored but deliberately not displayed.

## Design decisions to respect

- The owner chose to keep the current look (system serif stack, 62px orb, 5% fade) rather than adopt the Design canvas's restyle (Cormorant/Nunito fonts, larger orb, 40% dim). Take features and layout from the canvas, not its visual style, unless asked.
- The timer row is play button · time · "+5" button, both buttons 44px circles (`.round`). "+5" carries `aria-label`/`title` "Add 5 minutes" since the visible text omits the unit. The row is a `1fr auto 1fr` grid, so the time stays centred under "Meditation timer" whatever the button widths.
