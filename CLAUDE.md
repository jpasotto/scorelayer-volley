# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment

Push to `main` — GitHub Actions (`.github/workflows/deploy.yml`) automatically deploys the entire repo root to GitHub Pages. There is no build step.

To preview locally, serve the root directory with any static file server:
```bash
python3 -m http.server 8080
```

## Architecture

The entire application is a **single `index.html` file** with no build toolchain, no npm, and no backend.

**Runtime dependencies (all CDN):**
- React 18 (UMD build) + Babel Standalone — JSX is transpiled in-browser at runtime via `<script type="text/babel">`
- `mp4-muxer` (ES module via jsdelivr) — imported via `<script type="module">` and exposed as `window.Mp4Muxer` so Babel-transpiled code can access it

**Structure inside `index.html`:**
1. `<style>` block — all CSS using CSS custom properties defined on `:root`
2. `<script type="module">` — imports `mp4-muxer` and attaches it to `window`
3. `<script>` (vanilla JS) — constants, pure helper functions, export generators, LocalStorage autosave utilities
4. `<script type="text/babel">` — all React components and app state

**State management:** Single `useState` object (`createInitialState()`) in the root `App` component. No external state library. Match state is autosaved to `localStorage` under the key `scorelayer_match_autosave` after every point.

**Screens:** Controlled by a `screen` state variable with values from the `SCREEN` constant (`setup`, `match`, `csv_import`).

**Export formats generated client-side:**
- **SRT** — standard subtitle captions for Final Cut Pro
- **FCPXML** — native FCP timeline with positioned title clips (hardcoded 25 fps, 1920×1080)
- **ASS** — Advanced SubStation Alpha subtitles with positioned score + info rows
- **CSV** — point log with wall-clock time, video offset, set/match state
- **MP4 chroma key** — green-screen overlay generated in-browser using the WebCodecs API + `mp4-muxer`

**Volleyball rules (constants at top of script block):**
- `POINTS_TO_WIN_SET = 25`, `POINTS_TO_WIN_TIEBREAK = 15`, `SETS_TO_WIN_MATCH = 3`, `MIN_LEAD = 2`

**Sync mechanism:** The "Sync" button records `Date.now()` as `syncTimestamp`. All export timestamps are computed as `pointLog[i].timestamp - syncTimestamp`, so exports are relative to whenever the user pressed Sync (typically at video recording start or first serve).

## Live Share (v3.0, in `index-v3.html`)

A second top-level file, `index-v3.html`, adds an optional Live Share mode on top of the v2.9.4 baseline. The original `index.html` is the production build and is intentionally left untouched until the v3 cutover. Both files share the same origin and `localStorage` (autosave key `scorelayer_match_autosave`); v3's new state fields are additive so v2.9.4 ignores them when reading the cache.

**Roles** (new `state.role`):
- `solo` — default, identical to v2.9.4 behaviour, no network writes.
- `scorekeeper` — created by clicking **Share live** in the MATCH header; writes to RTDB.
- `spectator` — entered automatically when the URL contains `?m={matchId}`; read-only scoreboard plus a parent-highlight submission form.

**Backend:** Firebase Realtime Database, anonymous auth, Spark free tier. Configure once by editing `FIREBASE_CONFIG` near the top of `index-v3.html` with your project's web config. With an empty `databaseURL` the Share UI auto-hides and v3 behaves identically to solo.

**RTDB tree** (`/matches/{matchId}`):
- `meta/` — scorekeeper-only writes; teamA, teamB, syncTimestamp, scoreboard mirror, `scorekeeperUid`.
- `points/` — append-only; same shape as the local `pointLog` entries (corrections written as new entries with `correction:true`).
- `parentHighlights/{pushId}` — any signed-in user appends `{ name?, note, clientTimestamp, serverTimestamp, deleted }`. Scorekeeper alone can flip `deleted:true` to hide an entry.

**Security rules:** see `firebase-rules.json`. Paste into the Firebase console under Realtime Database ▸ Rules. They restrict `meta/` and `points/` writes to the scorekeeper UID, cap parent notes at 140 chars and names at 40 chars, and only allow the scorekeeper to set `deleted`.

**Spectator URL:** `https://<host>/scorelayer-volley/index-v3.html?m={matchId}`. Generated client-side by the Share modal; spectators see a QR that decodes to that URL.

**Parent highlights in exports:** YouTube chapters, CSV, and Highlights SRT all merge accepted (non-deleted) parent submissions in addition to the scorekeeper's `★` highlights. Parent timestamps come from the submitting client's `Date.now()` at button-press, so they align with the same `syncTimestamp` the scorekeeper used.

**Cutover plan:** when v3 is ready to replace v2.9.4, tag the commit (`git tag v2.9.4`), then `git mv index-v3.html index.html`. The PWA `manifest.json` `start_url` already points at `/`, so it picks up the new build on next launch with no config change. Document the cutover in `MEMORY_v3.0.md`.
