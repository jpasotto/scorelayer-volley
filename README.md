# 🏐 ScoreLayer Volley

A mobile-first volleyball score tracker that records timestamps for each point, with export to SRT subtitles, FCPXML (Final Cut Pro), CSV, and a chroma key video kit for iMovie overlay.

## Features

- **Live scoring** — Tap + / − to track points with set/match auto-detection
- **Sync button** — Press at a known video moment (first serve or recording start) to align timestamps
- **SRT export** — Import directly into Final Cut Pro as captions
- **FCPXML export** — Native Final Cut Pro timeline with positioned title clips
- **Chroma Key Kit** — Generates a green-screen MP4 overlay via Python + FFmpeg
- **PWA** — Add to Home Screen on iPhone/iPad for a native-app experience

## Usage

1. Open the app URL in Safari
2. Enter team names and tap **Start Match**
3. Press **Sync** when the video recording starts (or at first serve)
4. Tap **+** for each point scored
5. When the match ends, export in your preferred format

## Deployment

This repo auto-deploys to GitHub Pages via the included workflow.

To deploy your own:
1. Fork this repo
2. Go to **Settings → Pages → Source**: select "GitHub Actions"
3. Push to `main` — the site deploys automatically

## Analytics

ScoreLayer Volley uses two privacy-first, cookieless analytics tiers. No consent banner is required — no cookies, no fingerprinting, no personal data collected.

| Tier | Tool | Purpose |
|---|---|---|
| Pageviews & traffic | Cloudflare Web Analytics | Visits, referrers (Instagram), devices |
| In-app events | Matomo (self-hosted, cookieless) | Feature adoption, export usage, match completion |

**Tracked events:** `Match.Start`, `Match.Complete`, `Match.EndEarly`, `Highlight.Mark`, `Export.SRT/FCPXML/ASS/CSV/ChromaKit/Chapters/HlSRT`, `Export.MP4Start`, `Export.MP4Success`

## Tech Stack

Single `index.html` file — React 18 (CDN), no build step, no backend.

## Roadmap

ScoreLayer Volley is the first sport in the **ScoreLayer** platform family. Future plans include native iOS/Android apps with on-device MP4 generation and direct video overlay capabilities.

## License

© ScoreLayer
