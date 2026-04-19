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
