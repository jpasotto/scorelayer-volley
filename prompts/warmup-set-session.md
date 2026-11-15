# Session prompt: warm-up set (issue #76, part 1)

Paste the block below as the first message of a new Claude Code session on this
repository. It asks for a plan before any code, and for a PR without merging.

---

````text
You are working on ScoreLayer Volley (repo jpasotto/scorelayer-volley): a single-file PWA (`index.html`, React 18 UMD + in-browser Babel, no build step, no npm) for live volleyball scoring with timestamped exports and Firebase Live Share.

## Task
Let the scorekeeper mark the **first set as a warm-up set** that does not count toward the match score, **during the match** (from the scoring screen, while scoring). This is part 1 of issue #76. Part 2 of #76 (YouTube 10 s chapter spacing) is out of scope.

## Before changing anything
1. Read `CLAUDE.md` in full, especially the parts about pure state updaters (the 2026-10-03 incident), Live Share and the test harness.
2. Read issue #76.
3. Run `node --test tests/*.test.mjs` and report the result.
4. Then post a short plan: data model, the functions you'll touch, and any assumption you're making. Wait for my OK before you write code.

## What exists today (verify, don't trust blindly)
- `formatSetLabel(setNum, offset)` returns "Warm-up" when `setNum + offset === 0`.
- The match screen has −1 / 0 / +1 buttons for `setNumberOffset`. With −1, set 1 is **labelled** "Warm-up" (and "WU" in the log and header) and set 2 is labelled "Set 1". This only changes labels: the warm-up result still counts in `setsA`/`setsB` and toward `SETS_TO_WIN_MATCH`. As a result:
  - the overlay shows "Sets 1:0" after the warm-up;
  - the tie-break target (`getTargetPoints(setsA, setsB)`) is wrong;
  - the match can end one set early.
- Those buttons call `setState` only and don't mirror to Live Share.
- `extraSetMode` already records a set result without touching `setsA`/`setsB`. It is the end-of-match counterpart; reuse its pattern where it helps.
- Each point stores `setNum`, `setsA` and `setsB`.
- `scorePoint` increments the set score when a set is won. `undoLastPoint` rebuilds the whole state by replaying the point log.
- `buildMetaPatch` feeds Live Share `meta/`. `firebase-rules.json` rejects any unknown `meta` field (`"$other": { ".validate": false }`).
- `parseCSVToEntries` (CSV import) hard-codes the set label as `"Set " + d.setNum`, so it ignores any offset.

## Required behaviour
1. **Toggle.** A clear control on the scoring screen: "Set 1 is a warm-up (doesn't count)".
   - It is available while set 1 is in progress, and also after set 1 has ended as long as the match is not over. In that case it asks for confirmation, because it changes the set score.
   - It can be switched off again, with the same confirmation.
   - It must be hard to tap by accident mid-rally. Follow the existing confirm-dialog pattern.
2. **When on:**
   - set 1 is labelled Warm-up (WU) everywhere, and the next set is "Set 1", the one after "Set 2", and so on;
   - the warm-up result stays in the set history (marked as warm-up) but is **not** added to `setsA`/`setsB`;
   - it does not count toward `SETS_TO_WIN_MATCH`, and the tie-break target uses the corrected set score.
3. **Flag set after set 1 ended:** recompute `setsA`/`setsB` on every later point, plus `setHistory`, the current set score and `matchOver`. Use the same replay approach as `undoLastPoint`. Undo must also respect the flag.
4. **Existing offset buttons:** while the warm-up flag is on, the effective label offset is −1 and the buttons are disabled or hidden, so the two mechanisms can't fight. Keep the buttons for other uses when the flag is off. Propose a cleaner option in your plan if you see one.

## Exports, import and Live Share
- **Exports.** Every exporter (SRT, ASS, FCPXML, YouTube chapters, Highlights SRT, CSV, MP4 overlay, chroma script) shows "Warm-up" for set 1 and the renumbered sets. The overlay's "Sets x:y" line and the QR/reset screen after the warm-up show the corrected set score. Passing the effective offset is probably enough for labels; the set score comes from the corrected per-point `setsA`/`setsB`.
- **CSV.** `SetsA`/`SetsB` hold the corrected values. Make CSV round-trips keep the warm-up label. My suggestion: write the **effective** set number in the `Set` column (0 for the warm-up) and have `parseCSVToEntries` label sets with `formatSetLabel(d.setNum, 0)` instead of `"Set " + d.setNum`. Check that the importer's set-break and QR logic still works with set numbers 0, 1, 2…, and say in the plan if you choose differently.
- **Live Share.**
  - Mirror the flag through `buildMetaPatch`.
  - Add the field to `firebase-rules.json` (boolean).
  - Make the spectator view (scoreboard, previous sets list, highlight snapshots) use it.
  - When flagging after the fact rewrites points, replace the server log the way undo does.
  - The rules change must be pasted into the Firebase console by hand **before** the client writes the new field, so put that step prominently in the PR description.
- **Autosave and restore:** persist the flag. Old autosaves restore with the flag off. Don't change the autosave key.

## Constraints (from CLAUDE.md, strict)
- **Pure state updaters.** Take `Date.now()` and do Firebase writes **outside** `setState` updaters. Use `stateRef.current` and `mirrorOnce` as the existing code does. `undoLastPoint` currently calls `mirrorIfShared` inside its updater; since you will touch it, move that call out and say so in the PR.
- **Single-file architecture.** No new dependencies, no build step.
- **Testable logic.** Keep pure logic (recompute, effective offset, labels) inside the `// EXPORTERS_BEGIN` / `// EXPORTERS_END` region so `tests/harness.mjs` can test it.
- **Public repo.** Never commit real team or player names in tests or fixtures; use generic names (Home/Away, A/B).

## Tests (add to tests/exports.test.mjs or a new tests/warmup.test.mjs)
- Labels: warm-up shown as Warm-up, later sets renumbered, in SRT, chapters, CSV and overlay entries.
- Set score excludes the warm-up; tie-break target and match-over rule use the corrected score.
- Flag set after set 1 ended: per-point `setsA`/`setsB` recomputed; matchOver re-evaluated.
- Unflag restores the original numbering and set score.
- Undo with the flag on.
- CSV round trip: export → `parseCSVToEntries` keeps the Warm-up label and corrected set score.
- Existing tests still pass.

## Deliverables
- **Code:** a feature branch with clear commits.
- **Version:** bump `APP_VERSION` from 3.4.12-beta to 3.5.0-beta. If main has moved, use the next minor version.
- **Docs:** update the in-app manual in README.md (between the MANUAL_BEGIN/MANUAL_END markers) and the relevant section of CLAUDE.md.
- **PR:** reference "Part of #76" (don't close it). Include what you tested manually and on which browser, plus the Firebase rules deployment step.
- **Do not merge:** pushing to `main` deploys to production immediately, so I merge.
````
