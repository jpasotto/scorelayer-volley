# ScoreLayer Volley — Session Memory v2.9.x

> Use this file as context at the start of a new Claude Code session to resume
> work without re-explaining the codebase or previous decisions.
> Date: 2026-04-19

---

## Deployed Version

**v2.9.4** — live on GitHub Pages via `main` branch auto-deploy (after PRs #15, #16, #17, #18 merged).

Key commits on `main` after v2.9 work:
```
5e37c01  v2.9.4: QR overlay layout — right-aligned card, full score bar visible
0566df4  v2.9.3: replace QR code with Matomo-tracked URL
1fc6bd5  fix: QR overlay missing on CSV-imported matches (v2.9.2)
dc14573  feat: v2.9 inter-set QR marketing overlay
666b219  docs: add v2.8 session memory for future Claude Code sessions
```

---

## Architecture (unchanged from v2.8)

See MEMORY_v2.8.md for base architecture. Summary:
- **Single file:** everything in `index.html` (~2700 lines). No build step, no npm.
- **Two JS blocks:** `<script>` (plain helpers + generators) and `<script type="text/babel">` (React)
- **CDN deps:** React 18 UMD, Babel standalone, `mp4-muxer` (ES module → `window.Mp4Muxer`)
- **Deploy:** push to `main` → GitHub Actions → GitHub Pages

---

## Features Added in v2.9

### Inter-Set QR Marketing Overlay

During the gap between sets, the MP4 chroma key overlay now shows a three-segment sequence instead of a simple midpoint cut:

| Segment | Duration | Content |
|---------|----------|---------|
| `score` | 20 s from set end | Final score of the set just won |
| `qr` | gap − 60 s | QR card + full score bar (team score, set info, sets score) |
| `reset` | 40 s before next set | Next set 0:0 score |

**Guard:** if the gap between two sets is < 61 s (`MIN_GAP = 61`), the QR segment is skipped and the original midpoint-cut logic applies.

**QR card design (v2.9.4):**
- Right-aligned, 60px from right edge; card is 340×342 px
- QR image: 260×260 px (was 160 in v2.9.0)
- Header: "titles made with ScoreLayer" (bold italic 22px)
- Footer: `jpasotto.github.io/scorelayer-volley` (16px)
- 1 s fade-in / 1 s fade-out at QR segment boundaries (WebCodecs MP4 only)
- Full score bar (team score, set info, sets score) always visible on QR frames
- Position: bottom layout → card above score bar; top layout → card below title row

**QR URL (v2.9.3+):**
```
https://jpasotto.github.io/scorelayer-volley?mtm_source=video_overlay&mtm_medium=qr&mtm_campaign=scorelayer_v29
```
Matomo campaign parameters allow tracking QR scans from video overlays as a distinct metric (`scorelayer_v29` campaign). Without these, QR scans would appear as anonymous direct traffic.

**Note:** The QR image is a static PNG baked into the HTML as a base64 constant. To update the tracked URL for a new version, regenerate the QR with `qrcode` (Node.js npm package — Python qrcode/PIL unavailable in this environment) and replace both constants.

---

## New Constants / Functions (plain JS `<script>` block)

### Constants
```javascript
var APP_VERSION = "2.9.4";
var MIN_GAP = 61;          // seconds; gaps shorter than this skip the QR segment
var FADE_US  = 1_000_000;  // 1 s fade at QR segment start/end (microseconds)
var MAX_CHUNK_US = 2_000_000; // max VideoFrame duration for QR (fade granularity)
```

### QR image cache
```javascript
var QR_BASE64 = 'data:image/png;base64,...'; // ~6 KB, encodes tracked URL
var _qrImageCache = null;
async function getQRImageBitmap() { ... }    // loads once, caches in _qrImageCache
```

### New rendering function
```javascript
function renderQRFrame(ctx, entry, width, height, positionTop, qrBitmap, alpha)
```
Called from `renderOverlayFrame` when `entry.type === 'qr'`. Renders:
1. Full score bar (identical logic to normal frames)
2. White pill card on the right with QR image

### Updated `renderOverlayFrame` signature
```javascript
function renderOverlayFrame(ctx, entry, width, height, positionTop, qrBitmap, alpha)
```
Added `qrBitmap` and `alpha` parameters. Dispatches to `renderQRFrame` for QR entries.

---

## `setWon` Flag on pointLog Entries

Every `pointLog` entry now carries a `setWon: boolean` field, set at score time:

```javascript
// In scorePoint() JSX handler:
var target = getTargetPoints(setsA, setsB);
var setWon = isSetWon(pointsA, pointsB, target);
var newLog = s.pointLog.concat([{ ..., setWon: setWon }]);

// In reducePoint():
{ ..., setWon: false }

// In parseCSVToEntries() pointLog reconstruction:
setWon: isSetWon(d.pointsA, d.pointsB, getTargetPoints(setsA, setsB))
```

Used by `buildOverlayEntries()` and `parseCSVToEntries()` to detect set boundaries:
```javascript
var isSetEnd = p.setWon === true && i < pointLog.length - 1;
```

---

## Three-Segment Split Logic (in both entry builders)

There are **two independent entry builder loops** that both implement the QR split:

### 1. `buildOverlayEntries()` — live matches and restored autosaves
```javascript
var isSetEnd = p.setWon === true && i < pointLog.length - 1;
var gapSec = rawEndSec - startSec;
if (isSetEnd && gapSec >= MIN_GAP) {
  var scoreEnd = startSec + 20;
  var resetStart = rawEndSec - 40;
  var qrStart = scoreEnd;
  var qrEnd = resetStart;
  entries.push({ type: 'score', start: startSec, end: scoreEnd, ... });
  entries.push({ type: 'qr',    start: qrStart,  end: qrEnd,   score, set_info, title, sets_score });
  entries.push({ type: 'reset', start: resetStart, end: rawEndSec, score: '0 : 0', ... });
} else {
  // original: one score entry + optional blank
}
```

### 2. `parseCSVToEntries()` — CSV import path
Identical split logic but uses `csvSetWon` and `csvGapSec`. This was added in v2.9.2 to fix QR not appearing in CSV-imported MP4 exports.

```javascript
var csvSetWon = isSetWon(d.pointsA, d.pointsB, getTargetPoints(setsA, setsB));
var csvGapSec = rawEndSec - startSec;
if (csvIsSetBreak && csvSetWon && csvGapSec >= MIN_GAP_CSV) {
  // same three-segment push
}
```

**Critical:** `parseCSVToEntries()` builds its own `entries` array used directly by the CSV→MP4 path (`finalResult.entries` at the function return). `buildOverlayEntries()` is never called for CSV imports. Both must be kept in sync.

---

## `generateOverlayMP4()` — QR-Aware Changes

```javascript
// Pre-load QR bitmap once before the encoding loop
var hasQREntries = entries.some(function(e) { return e.type === 'qr'; });
var qrBitmap = null;
if (hasQREntries) {
  try { qrBitmap = await getQRImageBitmap(); } catch(e) {}
}

// Inside per-entry rendering loop:
if (entry.type === 'qr') {
  // QR entries: split into sub-chunks ≤ MAX_CHUNK_US for per-chunk alpha fade
  var chunkStart = entryStartUs;
  while (chunkStart < entryEndUs) {
    var chunkEnd = Math.min(chunkStart + MAX_CHUNK_US, entryEndUs);
    var chunkMid = (chunkStart + chunkEnd) / 2;
    var alpha = computeAlpha(chunkMid, entryStartUs, entryEndUs, FADE_US);
    renderOverlayFrame(ctx, entry, w, h, posTop, qrBitmap, alpha);
    // encode VideoFrame at chunkStart
    chunkStart = chunkEnd;
  }
} else {
  // Non-QR entries: render once, reuse bitmap
  renderOverlayFrame(ctx, entry, w, h, posTop, null, 1.0);
  // encode single VideoFrame for full entry duration
}
```

Alpha computation:
```javascript
function computeAlpha(tUs, startUs, endUs, fadeUs) {
  if (tUs < startUs + fadeUs) return (tUs - startUs) / fadeUs;      // fade in
  if (tUs > endUs   - fadeUs) return (endUs   - tUs) / fadeUs;      // fade out
  return 1.0;
}
```

---

## Python Chroma Kit (`generateChromaScript()`) — QR Changes

### QR constants in heredoc
```python
QR_B64 = 'iVBORw0KGgo...'  # raw base64, no data URI prefix; ~5992 chars
```

### `draw_score_frame` QR branch (v2.9.4)
The QR branch now renders the full score bar first, then overlays the card:
```python
if active.get('type') == 'qr':
    # Full score bar (same as normal branch)
    score_text = active['score']
    # ... draw centered score, info row, title, sets_score ...

    # QR card: right-aligned
    QR_SIZE = 260
    PILL_W, PILL_R = 340, 14
    TITLE_H, URL_H = 46, 36
    PILL_H = TITLE_H + QR_SIZE + URL_H
    MARGIN = 60
    pill_x = WIDTH - PILL_W - MARGIN
    pill_y = sy2 - PILL_H - 16   # sy2 = HEIGHT - 180 (info row top)
    draw.rounded_rectangle([pill_x, pill_y, pill_x+PILL_W, pill_y+PILL_H], ...)
    # ... draw title text, QR image, URL text ...
    return img
```

### Three-segment split in chroma script entries builder
Same logic as `buildOverlayEntries()` applied inside the Python entries list serialised as JSON.

---

## Autosave Fields (updated for v2.9)

`pointLog` entries now include `setWon`. Old autosaves (pre-v2.9) lack this field; code uses `p.setWon === true` (strict equality) so missing/undefined is safe — treated as false.

---

## State Shape (no new top-level fields vs v2.8)

See MEMORY_v2.8.md. `pointLog` entries gained one field:
```javascript
pointLog: [{
  timestamp, wallClock, setNum,
  pointsA, pointsB, setsA, setsB,
  team, correction,
  highlight, highlightNote,
  setWon,          // NEW in v2.9 — true if this point ended the set
}]
```

---

## Analytics

Matomo is configured at `quandopasso.com/Matomo/` (site ID 2) via `_paq` in the `<head>`. Standard `trackPageView` + `enableLinkTracking`.

QR scans arrive with no HTTP referrer (scanner apps don't send one), so without campaign parameters they appear as direct traffic. The `mtm_*` parameters solve this — Matomo reads them on page load and attributes the visit to the campaign.

---

## Bugs Fixed in v2.9.x

### v2.9.2 — QR missing from CSV-imported match MP4
**Root cause:** `parseCSVToEntries()` has its own independent entry builder that was not updated in v2.9.0. The CSV→MP4 path uses `finalResult.entries` directly and never calls `buildOverlayEntries()`.

**Fix:** Applied identical three-segment split logic inside `parseCSVToEntries()`, and added `setsA`, `setsB`, `setWon` to the reconstructed `pointLog` entries within that function.

### v2.9.3 — QR scans not tracked in Matomo
**Root cause:** Original QR encoded bare URL with no campaign parameters.

**Fix:** Regenerated QR with tracked URL using Node.js `qrcode` npm package (Python unavailable). Replaced `QR_BASE64` (JS data URI) and `QR_B64` (Python heredoc raw base64) in `index.html`.

### v2.9.4 — QR frame missing score bar; QR card small and centered
**Root cause:** `renderQRFrame` only showed `sets_score`, not the full score bar; QR was centered and small.

**Fix:** Rewrote `renderQRFrame` to render full score bar identically to `renderOverlayFrame`, moved card to right side, enlarged QR from 160→260 px. Python chroma script updated to match.

---

## QR Code Regeneration (for future versions)

If the tracked URL or QR image needs to change:

```bash
cd /tmp
npm install qrcode   # if not already installed
node -e "
  const QRCode = require('qrcode');
  const url = 'https://jpasotto.github.io/scorelayer-volley?mtm_source=video_overlay&mtm_medium=qr&mtm_campaign=scorelayer_vXX';
  QRCode.toDataURL(url, { errorCorrectionLevel: 'M', width: 300, margin: 2 }, (err, dataUri) => {
    const b64 = dataUri.replace('data:image/png;base64,', '');
    require('fs').writeFileSync('/tmp/qr_new_b64.txt', b64);
    require('fs').writeFileSync('/tmp/qr_new_datauri.txt', dataUri);
    console.log('Length:', b64.length);
  });
"
```

Then replace in `index.html`:
- `var QR_BASE64 = 'data:image/png;base64,...'` — full data URI
- `"QR_B64 = '...'"` — raw base64 only (inside the Python heredoc string)

Use Python regex replacement for reliability (lines are 5000+ chars):
```python
import re
content = open('index.html').read()
new_b64 = open('/tmp/qr_new_b64.txt').read().strip()
content = re.sub(r"var QR_BASE64 = 'data:image/png;base64,[A-Za-z0-9+/=]+'",
                 "var QR_BASE64 = 'data:image/png;base64," + new_b64 + "'", content)
content = re.sub(r'("QR_B64 = \')[A-Za-z0-9+/=]+(\'\")',
                 r'\g<1>' + new_b64 + r'\g<2>', content)
open('index.html', 'w').write(content)
```

---

## Testing Pattern (no browser)

```javascript
// Node.js eval of plain <script> block
var window = {};
var html = require('fs').readFileSync('index.html', 'utf8');
var scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
var plain = scripts.find(s => !s.includes('type=') && s.includes('function generateSRT'));
eval(plain.replace(/<script[^>]*>/, '').replace(/<\/script>/, ''));
// Call: buildOverlayEntries(), parseCSVToEntries(), isSetWon(), etc.
```

Key things to test for QR:
- `buildOverlayEntries()` with a point log containing a `setWon: true` entry and gap ≥ 61 s → 3 consecutive entries of types `score / qr / reset`
- Same log with gap < 61 s → no QR entry
- `parseCSVToEntries()` with a CSV containing a set boundary gap ≥ 61 s → same 3-entry pattern
- `isSetWon(25, 16, 25)` → `true`; `isSetWon(26, 25, 25)` → `false` (lead < 2)

---

## Future Work / Roadmap Ideas

(carried forward from v2.8 plus new items)

- **QR campaign versioning:** QR image is static — updating the campaign slug for a new version requires manual regeneration. Consider a redirect URL approach if this becomes frequent.
- **QR fade in Python chroma kit:** The Python script generates static PNG frames with no fade; the 1 s fade is WebCodecs-only. Could be implemented with PIL alpha blending if needed.
- **Pricing / billing:** See MEMORY_v2.8.md. Beta badge + modal already in place.
- **PWA offline caching:** `manifest.json` + icons exist; service worker not yet added.
- **CSV import set labels:** `parseCSVToEntries` uses raw `"Set " + d.setNum` (no offset). Extend if set-offset matters for imported matches.
- **5th-set manual end:** By design — `extraSetMode` + tiebreak target requires "End Match" button.
