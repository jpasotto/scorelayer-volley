# ScoreLayer Volley v2.8 — Courtside Resilience & Post-Match Editability

**Baseline:** v2.7 (live on `main`)
**Branch:** `claude/v2-8-courtside-fixes-XXXXX`
**Delivery:** single production-ready `index.html`

## Feature scope

| # | Feature | Type | Source |
|---|---|---|---|
| 1 | Editable team names + match title on match-over screen | Enhancement | Courtside feedback |
| 2 | Continue match (+1 set) + set offset with "Warm-up" auto-label | Enhancement | Courtside feedback |
| 3 | Highlight pill: 8s default + tap-to-extend + touch-pause | UX defect | Courtside feedback |
| 4 | Re-sync button: simple unblock + confirmation dialog | Bug fix | Courtside feedback |
| 5 | YouTube Chapters: set boundaries + validation | Enhancement | Issue #11 |

**Out of scope (deferred to v2.9):** multi-segment recording / multiple sync points.

---

## Feature 1 — Editable team names & match title post-match

**Goal.** After the match ends, allow renaming `teamA`, `teamB`, and `matchTitle` before any export. Re-exports must reflect the corrected names.

**Why it works without generator changes.** All five generators (`generateSRT`, `generateCSV`, `generateFCPXML`, `generateASS`, `generateChromaScript`) and `buildOverlayEntries` accept `teamA`/`teamB`/`matchTitle` as parameters and are called from React state at export time. `pointLog[i].team` is stored as `"A"|"B"`, never as the name string — so retroactive renames are loss-free.

**Implementation.**
- In the match-over screen JSX, replace the static team name display with three controlled inputs (`teamA`, `teamB`, `matchTitle`), styled per existing `title-input-wrap`.
- On change, update React state and call `autosaveState`.
- No changes to generators, `pointLog`, or CSV parser.

**Insertion point.** React component, match-over branch (rendered when `state.matchOver === true`). Locate the existing match title input block and add team name inputs above it.

**Non-regression checks.** Existing matches without renamed teams must export identically to v2.7.

---

## Feature 2 — Continue match + set offset

### 2a. "Continue match (+1 set)" button

When `matchOver === true`, render a secondary button on the match-over screen labeled **"Continue match (+1 set)"**.

**Behavior on tap:**
- `matchOver = false`
- `currentSet = currentSet + 1`
- `pointsA = 0`, `pointsB = 0`
- Do **not** modify `setsA` / `setsB`
- Set new state flag `state.extraSetMode = true`
- Persist via `autosaveState`

**Display impact during extra set.**
- Show persistent badge `EXTRA SET` on the sets bar (use existing warning color tokens)
- Auto end-detection (`isSetWon` triggering match-over) is **suppressed while `extraSetMode === true`**
- New button **"End match"** appears in the controls bar; it's the only way to return to match-over while in extra-set mode
- "Continue match" can be tapped again from match-over to add further sets (theoretically unbounded)

### 2b. Set offset with "Warm-up" labeling

Add `state.setNumberOffset: number` (default `0`, range `-1` to `+1`).

**UI.** On the match-over screen, add a segmented control:
> **Set numbering:** `[−1] [0] [+1]`

**Display rule.** When rendering set numbers anywhere (sets bar, point log, exports):
- `displaySetNum = p.setNum + state.setNumberOffset`
- If `displaySetNum === 0`, render as `"Warm-up"` instead of `"Set 0"`
- Negative values shouldn't occur in practice but should render as `"Set N"` literally

**Generator changes.** Add a helper:

```javascript
function formatSetLabel(setNum, offset) {
  var n = setNum + offset;
  if (n === 0) return "Warm-up";
  return "Set " + n;
}
```

Pass `setNumberOffset` into all generators that currently emit `"Set " + p.setNum` and replace inline string concatenation with `formatSetLabel(p.setNum, offset)`. Affected generators:
- `generateSRT`
- `generateFCPXML`
- `generateASS`
- `generateChromaScript` (inside the JSON entries build, including the Python `set_info` field)
- `buildOverlayEntries`
- `generateYouTubeChapters` (see Feature 5)

**Non-regression checks.**
- A match exported with `setNumberOffset === 0` must produce byte-identical output to v2.7
- A match where the user logged "set 1" but it was warm-up: applying offset `-1` should turn set 1 → "Warm-up", set 2 → "Set 1", etc., consistently across all six exports

---

## Feature 3 — Highlight pill duration & extension

**Root cause.** Fixed-duration auto-dismiss timeout in the highlight pill `tagging` phase (introduced v2.6) is too short for courtside decision-making.

**Changes.**

1. Add at top of pure-JS script block:
   ```javascript
   var HIGHLIGHT_PILL_MS = 8000;
   var HIGHLIGHT_PILL_EXTEND_MS = 8000;
   ```

2. **Tap-to-extend.** Tapping the pill body (not a tag button) resets the auto-dismiss timer to `HIGHLIGHT_PILL_EXTEND_MS`. Implementation: clear existing `setTimeout`, set a new one. Provide subtle visual feedback (brief opacity pulse or border flash).

3. **Touch-pause.** On `touchstart` over the pill, clear the dismiss timer. On `touchend` or `touchcancel`, restart it with `HIGHLIGHT_PILL_EXTEND_MS`. This protects against the user holding a finger near the pill while deciding.

4. **No regression** to the iOS keyboard-prevention work from v2.6: the `tagging` phase logic stays intact; only the auto-dismiss timer behavior changes.

**Insertion point.** The React component handling the highlight pill state machine (introduced in v2.5/v2.6). Locate the `setTimeout` that triggers transition from `tagging` to dismissed.

---

## Feature 4 — Re-sync button (simple v2.8 fix)

**Diagnosis approach.** The handler is in the bottom half of `index.html` (lines ~1000–1812). Claude Code should:

1. Locate the sync button click handler (search for `syncTimestamp` assignments inside the React component).
2. Identify whether the bug is a guard like `if (!state.syncTimestamp)` blocking re-press, or a missing state setter call.

**Fix specification.**
- Re-pressing the Sync button must overwrite `state.syncTimestamp` with the current `Date.now()`.
- **Before** overwriting, show a confirmation dialog (use existing `.confirm-overlay` / `.confirm-dialog` styles):
  > **Re-sync video alignment?**
  > This will rebase all logged points to the new sync moment. The original sync point will be lost. Continue?
  > [Cancel] [Re-sync]
- On confirm: `setState({ syncTimestamp: Date.now() })` + `autosaveState`.
- All generators already compute `p.timestamp - syncTimestamp` on the fly, so offsets recalculate automatically — no point log mutation needed.

**Explicit non-goal.** This is **not** the multi-segment fix. v2.8 still assumes one sync point per match. The dialog warning text is intentional: it tells the user the original alignment is destroyed. The full multi-segment solution is v2.9.

---

## Feature 5 — YouTube Chapters enhancement (closes #11)

### 5a. Always inject set-boundary chapters

Modify `generateYouTubeChapters` (introduced v2.5) so the chapter list always contains, in chronological order:

1. `00:00 Match Start`
2. One chapter per set boundary, derived from the **timestamp of the first scoring event of each set** (search `pointLog` grouped by `setNum`, take the earliest), formatted as `MM:SS Set 1 Start`, `MM:SS Set 2 Start`, etc. — using `formatSetLabel` from Feature 2 so warm-up renders correctly (e.g. `MM:SS Warm-up Start`)
3. All highlight chapters, interleaved chronologically

**Visual distinction.** Set-boundary chapters have **no leading `★`**. Highlight chapters keep the existing `★` prefix. This lets viewers distinguish navigation markers from notable plays at a glance.

**Set 1 starts at 00:00 edge case.** If the first scoring event of Set 1 is at video offset `00:00:00` (or within the first 1 second), do not emit a duplicate. Use `00:00 Set 1 Start` instead of `00:00 Match Start` in this case.

### 5b. Pre-export validation

Add a `validateYouTubeChapters(chapters)` function that returns `{ valid: boolean, errors: string[] }`. Rules to enforce, defined in a single constant block at top of file:

```javascript
var YOUTUBE_CHAPTER_RULES = {
  FIRST_AT_ZERO: true,           // First chapter must be at 00:00
  MIN_CHAPTERS: 3,               // Minimum 3 chapters total
  MIN_DURATION_SEC: 10,          // Each chapter must be ≥10s long
  ASCENDING_ORDER: true,         // Strictly ascending
  SECOND_WITHIN_SEC: 600,        // Second chapter must start within first 10 min
};
```

**Validation surfacing.** Before download, run the validator. If errors exist, show an error modal (use existing `.error-modal-overlay`) listing each violation in plain language, with a **"Download anyway"** button alongside **"Cancel"**. Do not block silently.

**⚠️ Implementation-time verification step.** YouTube's chapter rules shift periodically. **Before merging, re-verify each rule against YouTube's current help documentation** (`https://support.google.com/youtube/answer/9884579`). Update the constant block if any rule has changed. Document the verification date in a code comment above `YOUTUBE_CHAPTER_RULES`.

### 5c. Stretch — video-duration mismatch warning

**Optional, only if straightforward.** Add an optional input on the export modal: `Expected video duration (mm:ss)`. If provided, and the last chapter's timestamp is within 30 seconds of (or beyond) that duration, surface a soft warning:

> ⚠️ Last chapter at `HH:MM:SS` is close to or beyond your stated video duration (`HH:MM:SS`). YouTube will silently drop chapters past the actual video end. Confirm the upload's real duration before pasting.

Skip if it adds complexity to the validation flow. Mark as "stretch" — not a blocking acceptance criterion.

### Acceptance criteria (from issue #11)

- 3-set match exports contain at minimum: `00:00 Match Start`, `Set 1 Start`, `Set 2 Start`, `Set 3 Start`, plus all highlights, chronologically ordered
- Validator rejects (with user-visible message) any list violating §5b rules
- Highlight-only behavior remains correct for matches that already had valid chapter lists in v2.7
- Manual test: upload a real match's chapters to YouTube, confirm segmented progress bar appears (not just inline-linkified timestamps)

---

## Non-regression test plan

| Test | Expected |
|---|---|
| Load v2.7 autosave | Loads cleanly; `setNumberOffset` defaults to 0; `extraSetMode` defaults to false |
| Score a 3-set match end-to-end without using new features | All 6 exports byte-identical to v2.7 output |
| Export YouTube Chapters from a v2.7-style match (highlights only, valid) | Validator passes; output adds set-boundary chapters but keeps all highlights |
| Trigger continue-match, score a set, end manually | Match-over screen shows extra set in summary; exports include the extra set |
| Apply offset −1, export all formats | All set labels shifted; set 1 → "Warm-up" everywhere consistently |
| Tap highlight pill, hold finger, release | Timer pauses on hold, restarts on release |
| Re-sync button after first sync | Dialog appears; confirming overwrites; canceling preserves original |
| YouTube validator with <3 chapters | Error modal lists violation; "Download anyway" works |
| Existing CSV import | Parses cleanly (no schema change) |
| WebCodecs MP4 export with offset applied | Set labels in overlay reflect offset |

---

## Post-deployment manual steps

1. Re-verify YouTube chapter rules at `https://support.google.com/youtube/answer/9884579` and update `YOUTUBE_CHAPTER_RULES` if needed; document verification date in code comment.
2. Manual upload test on YouTube to confirm segmented progress bar appears.
3. Test on real iPhone (Safari) to confirm highlight pill touch-pause works with finger.
4. Bump version constant from `2.7` → `2.8`.
5. Update README.md changelog section.

---

## Out of scope (do not implement)

- Multi-segment recording / multiple sync points → **v2.9**
- Highlight metadata in ASS export
- Federation data importer
- Per-set custom labels beyond the offset+warm-up rule
