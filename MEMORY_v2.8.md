# ScoreLayer Volley — Session Memory v2.8

> Use this file as context at the start of a new Claude Code session to resume
> work without re-explaining the codebase or previous decisions.
> Date: 2026-04-18

---

## Deployed Version

**v2.8** — live on GitHub Pages via `main` branch auto-deploy.

Key commits on `main` after v2.8 merge:
```
82dd79c  Add eye-catching BETA badge with pricing info modal
e2d8be0  Fix three regressions found in post-v2.8 audit
43b6734  Fix highlight subtitles to cover the full rally window
4f23b0a  fix: extra set now auto-ends when a team reaches 25 points
00b027c  fix: clear score overlay at set-break midpoint before new set begins
999c933  feat: ScoreLayer Volley v2.8 — Courtside Resilience & Post-Match Editability
```

---

## Architecture (unchanged from v2.7)

- **Single file:** everything is in `index.html` (~2530 lines). No build step, no npm.
- **Two JS blocks inside index.html:**
  1. `<script>` — pure JS: constants, helpers, all export generators, autosave utils
  2. `<script type="text/babel">` — React 18 + Babel standalone: all components & app state
- **CDN deps:** React 18 UMD, Babel standalone, `mp4-muxer` (ES module → `window.Mp4Muxer`)
- **State:** single `useState` object in root `App` component (`createInitialState()`)
- **Deploy:** push to `main` → GitHub Actions → GitHub Pages (no build)
- **Local preview:** `python3 -m http.server 8080`

---

## Features Added in v2.8 (from GitHub issue #12)

### Feature 1 — Post-match team name & title editing
- Match-over screen has editable `<input>` fields for `teamA`, `teamB`, and `matchTitle`
- Changes are retroactive (point log stores `team:"A"|"B"`, never name strings)
- Set-numbering segmented control also on match-over screen

### Feature 2a — Continue match (+1 set) / Extra Set Mode
- "Continue match (+1 set)" button on match-over screen
- Sets `extraSetMode: true` in state → current set plays to 25 (or user-set target)
- Extra set auto-ends when a team reaches 25; `matchOver = true` without changing `setsA`/`setsB`
- In extra set mode, "End Match" button in controls bar ends directly (no confirm dialog)
- A 5th set at 15 still requires manual end (by design)

### Feature 2b — Set number offset / Warm-up labeling
- `setNumberOffset` state field (integer, default 0)
- `formatSetLabel(setNum, offset)` → `"Warm-up"` if `setNum + offset === 0`, else `"Set N"`
- Segmented control on match-over screen: "−1 set (warm-up)", "Normal", "+1 set"
- Applied consistently across **all 6 export generators** and display

### Feature 3 — Highlight pill improvements
- Duration extended to 8 s (`HIGHLIGHT_PILL_MS = 8000`)
- Touch-hold pauses dismissal; touch-release restarts 8 s timer (`HIGHLIGHT_PILL_EXTEND_MS`)
- Timer is `HIGHLIGHT_PILL_EXTEND_MS` after touch-release (not original 8 s reset)

### Feature 4 — Re-sync confirmation dialog
- Tapping Sync when already synced shows a confirm dialog ("resync" action)
- Prevents accidental video offset reset mid-match

### Feature 5 — YouTube Chapters export
- `buildYouTubeChapterList(pointLog, syncTimestamp, teamA, teamB, setNumberOffset)`
  → `[{ timeMs, text }]` with set-boundary chapters + highlight chapters
- `validateYouTubeChapters(chapters)` → `{ valid, errors[] }` enforcing YouTube rules:
  first at 00:00, ≥3 chapters, ≥10 s each, strictly ascending, second within 600 s
- If invalid: error modal with "Download anyway" / "Cancel"
- Highlight chapters whose `timeMs` coincides with a set-boundary are skipped (dedup)
- Set 1 at 00:00 edge case handled

### Beta Badge (post-v2.8 addition)
- Amber/gold pulsing glow badge inline with app title
- Tap → modal: "All features are free to use during the beta phase. Export tools
  (MP4, SRT, FCPXML, YouTube Chapters…) may require a plan after launch."
- CSS classes: `.beta-badge`, `.beta-modal-overlay`, `.beta-modal`, `.beta-modal-title`,
  `.beta-modal-msg`, `.beta-modal-note`
- State: `const [showBetaModal, setShowBetaModal] = useState(false)`

---

## Bugs Fixed in This Session

### Bug A — Score overlay lingered until first point of new set
- All generators now cut at the **midpoint** between the last point of a set and the
  first point of the next set:
  ```javascript
  var isSetBreak = nextP && nextP.setNum !== p.setNum;
  var endMs = isSetBreak ? Math.round((startMs + rawEndMs) / 2) : rawEndMs;
  ```

### Bug B — Extra set never auto-ended at 25
- Root cause: `isSetWon` was gated by `&& !s.extraSetMode`, blocking all set-end detection
- Fix: `extraSetMode` branch sets `matchOver = true` without incrementing `setsA`/`setsB`

### Bug C — Highlights appeared AFTER rally ended, not during it
- Highlighted points now shift `startMs` back to `pointLog[i-1].timestamp - syncTimestamp`
  (same-set guard: `pointLog[i-1].setNum === p.setNum`)
- **Look-ahead truncation**: non-highlight entry preceding a highlight gets `rawEndMs`
  capped to `p.timestamp - syncTimestamp`; if `endMs <= startMs`, entry is skipped
- Zero-duration entries filtered: `entries.filter(e => e.end > e.start)`
- Applied to: `generateSRT`, `generateFCPXML`, `generateASS`, `generateHighlightsSRT`,
  `buildOverlayEntries`, `generateChromaScript`, `parseCSVToEntries`

### Bug D (audit) — `generateHighlightsSRT` missing `setNumberOffset`
- Was using `"Set " + p.setNum`; now uses `formatSetLabel(p.setNum, setNumberOffset)`
- Added parameter to signature and both call sites (live export + CSV import)

### Bug E (audit) — Consecutive highlights overlapped in Highlights SRT
- Added same look-ahead truncation as other generators

### Bug F (audit) — `parseCSVToEntries` missing highlight timing fix
- CSV import path now has full rally-start shift + truncation + zero-duration filter
- Ensures MP4 generation from imported CSVs matches live-match path

---

## Key Code Patterns

### Export generators (plain JS block)
All generators accept `setNumberOffset` (last or second-to-last param):
```javascript
generateSRT(pointLog, syncTimestamp, teamA, teamB, setNumberOffset)
generateFCPXML(pointLog, syncTimestamp, teamA, teamB, setNumberOffset)
generateASS(pointLog, syncTimestamp, teamA, teamB, matchTitle, setNumberOffset)
generateHighlightsSRT(pointLog, syncTimestamp, teamA, teamB, setNumberOffset)
generateChromaScript(pointLog, syncTimestamp, teamA, teamB, matchTitle, setNumberOffset)
buildOverlayEntries(pointLog, syncTimestamp, teamA, teamB, matchTitle, setNumberOffset)
buildYouTubeChapterList(pointLog, syncTimestamp, teamA, teamB, setNumberOffset)
generateYouTubeChapters(pointLog, syncTimestamp, teamA, teamB, setNumberOffset)
parseCSVToEntries(csvText, matchTitle)  // no offset — CSV import always uses 0
```

### Highlight timing pattern (in every generator loop)
```javascript
// Shift start back to rally beginning
if (p.highlight && i > 0 && pointLog[i - 1].setNum === p.setNum) {
  var rallyStartMs = pointLog[i - 1].timestamp - syncTimestamp;
  if (rallyStartMs >= 0) startMs = rallyStartMs;
}
// Prevent overlap with next highlight
var nextP = i < pointLog.length - 1 ? pointLog[i + 1] : null;
var nextHighlightSameSet = nextP && nextP.highlight && nextP.setNum === p.setNum;
var rawEndMs = nextHighlightSameSet
  ? (p.timestamp - syncTimestamp)
  : (nextP ? nextP.timestamp - syncTimestamp : startMs + 10000);
// Set-break midpoint
var isSetBreak = nextP && nextP.setNum !== p.setNum;
var endMs = isSetBreak ? Math.round((startMs + rawEndMs) / 2) : rawEndMs;
if (endMs <= startMs) continue; // skip zero-duration entries
```

### For `buildOverlayEntries` / `generateChromaScript` (seconds, not ms):
```javascript
if (p.highlight && i > 0 && pointLog[i - 1].setNum === p.setNum) {
  var rallyStartSec = (pointLog[i - 1].timestamp - syncTimestamp) / 1000;
  if (rallyStartSec >= 0) {
    startSec = rallyStartSec;
    if (entries.length > 0 && !entries[entries.length - 1].blank) {
      entries[entries.length - 1].end = Math.round(startSec * 1000) / 1000;
    }
  }
}
// ... then at end of function:
return entries.filter(function(e) { return e.end > e.start; });
```

### Autosave fields (must be kept in sync)
`autosaveState()` saves: `pointLog`, `syncTimestamp`, `teamA`, `teamB`, `matchTitle`,
`currentSet`, `setsA`, `setsB`, `setHistory`, `matchOver`, `screen`,
`extraSetMode`, `setNumberOffset`

`restoreAutosave()`: `setState({ extraSetMode: false, setNumberOffset: 0, ...saved })`
(defaults protect against v2.7 autosaves that lack these fields)

### Constants (plain JS block, after `MIN_LEAD`)
```javascript
var APP_VERSION = "2.8";
var HIGHLIGHT_PILL_MS = 8000;
var HIGHLIGHT_PILL_EXTEND_MS = 8000;
var YOUTUBE_CHAPTER_RULES = {
  FIRST_AT_ZERO: true, MIN_CHAPTERS: 3, MIN_DURATION_SEC: 10,
  ASCENDING_ORDER: true, SECOND_WITHIN_SEC: 600,
};
```

### Testing (no browser available)
Use Node.js `eval()` of the plain `<script>` block:
```javascript
var window = {};
var html = fs.readFileSync('index.html', 'utf8');
var scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
var plain = scripts.find(s => !s.includes('type=') && s.includes('function generateSRT'));
eval(plain.replace(/<script[^>]*>/, '').replace(/<\/script>/, ''));
// now call generateSRT(), buildOverlayEntries(), etc.
```

---

## State Shape (createInitialState)

```javascript
{
  screen: "setup",           // "setup" | "match" | "csv_import"
  teamA: "Home", teamB: "Away", matchTitle: "",
  currentSet: 1,
  pointsA: 0, pointsB: 0,
  setsA: 0, setsB: 0,
  setHistory: [],            // [{ winnerA, scoreA, scoreB }]
  pointLog: [],              // [{ timestamp, wallClock, setNum, pointsA, pointsB, setsA, setsB, team, correction, highlight, highlightNote }]
  syncTimestamp: null,       // Date.now() when Sync pressed
  matchOver: false,
  extraSetMode: false,       // v2.8: playing a bonus set after match
  setNumberOffset: 0,        // v2.8: -1 (warm-up), 0 (normal), +1
}
```

---

## Volleyball Rules Constants
```javascript
POINTS_TO_WIN_SET = 25
POINTS_TO_WIN_TIEBREAK = 15
SETS_TO_WIN_MATCH = 3
MIN_LEAD = 2
```

---

## Future Work / Roadmap Ideas

- **Pricing / billing:** Export features (MP4, SRT, FCPXML, YouTube Chapters, Chroma Kit)
  are candidates for a paid tier. Beta badge modal already sets this expectation.
  The BETA badge and modal CSS are in place; when a plan system is added, the modal
  text should be updated.
- **5th-set manual end:** When `extraSetMode` is true and the target is 15 (tiebreak),
  the match must be manually ended via "End Match" button. By design.
- **PWA offline caching:** `manifest.json` and `icon-192.png` already exist. A
  service worker could be added for full offline support.
- **ASS subtitle rendering:** currently renders at hardcoded 1920×1080. A resolution
  selector could be added.
- **CSV import set labels:** `parseCSVToEntries` always uses `"Set " + d.setNum`
  (no offset). If set-offset is meaningful for imported matches, this would need
  extending.
