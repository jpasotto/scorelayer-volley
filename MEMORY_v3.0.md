# ScoreLayer Volley — Session Memory v3.0.x

> Use this file as context at the start of a new Claude Code session to resume
> work on the v3.0 Live Share feature without re-explaining the codebase.
> Date: 2026-05-03

---

## Status

**v3.0.0-beta** — under development on branch `claude/match-score-highlights-DMJPF`.

Live Share is built in a NEW file `index-v3.html` (a copy of `index.html`) so the
production URL `/scorelayer-volley/` keeps serving the stable v2.9.4 build until
the cutover. Testers reach the new build at `/scorelayer-volley/index-v3.html`.

---

## What's new in v3.0

### Live Share

Lightweight realtime mode so any parent in the stands can:

1. Open a URL on their own phone and watch the scoreboard update live as the
   scorekeeper clicks.
2. Tap **★ Mark highlight**, optionally type a 140-char note ("big dig by #7"),
   and submit it. The submission is timestamped using the parent's own phone
   clock so it lines up with the same `syncTimestamp` the scorekeeper used.
3. See every other parent's submitted highlights in a live-updating list.

The scorekeeper can delete spam from a moderation panel inside the existing
point-log view.

Parent highlights are merged into all the existing exports — YouTube chapters,
CSV, and the highlights-only SRT — so the final video ends up richer with no
extra editing work.

### Roles (new `state.role` field)

- `solo` — default, identical to v2.9.4. No network writes. Live Share UI hidden
  if Firebase is unconfigured.
- `scorekeeper` — created by clicking **Share live** in the MATCH header. All
  score writes go to RTDB via `sync.*` helpers, gated on
  `state.isShared && state.role === 'scorekeeper'`.
- `spectator` — entered automatically when the URL contains `?m={matchId}`.
  Read-only scoreboard + parent submission form + live highlight list.

### Backend

Firebase Realtime Database, anonymous auth, Spark free tier. Configure once
by editing the `FIREBASE_CONFIG` constant at the top of the `<script>` block in
`index-v3.html`. With an empty `databaseURL`, the Share button is hidden and
solo mode is unchanged.

CDN scripts loaded eagerly (compat builds, 10.13.2):
- `firebase-app-compat.js`
- `firebase-auth-compat.js`
- `firebase-database-compat.js`

### RTDB tree

```
/matches/{matchId}
  meta/                # scorekeeper-only writes; everyone reads
    teamA, teamB, matchTitle, setNumberOffset
    scorekeeperUid     # written once at createMatch
    syncTimestamp      # shared t=0
    currentSet, setsA, setsB, pointsA, pointsB
    matchStarted, matchOver, extraSetMode
    createdAt, appVersion
  points/{pushId}      # scorekeeper-append; everyone reads
    team, pointsA, pointsB, setsA, setsB, setNum,
    timestamp, wallClock, correction, highlight, highlightNote, setWon
  parentHighlights/{pushId}    # any signed-in user appends
    name, note, clientTimestamp, serverTimestamp, deleted
```

### Security rules

See `firebase-rules.json` in the repo root. Paste into the Firebase console
under Realtime Database ▸ Rules.

- `meta/*` and `points/*` writable only when `auth.uid === scorekeeperUid`.
- `parentHighlights/{id}` — new writes allowed by any signed-in user; note ≤140,
  name ≤40. `deleted:true` writable only by the scorekeeper.
- All match data readable by any signed-in user.

---

## File map

- **`index-v3.html`** — v3 development target. ALL v3 changes land here.
- **`index.html`** — v2.9.4 production. UNTOUCHED until cutover.
- **`firebase-rules.json`** — RTDB security rules (manual paste into Firebase).
- **`CLAUDE.md`** — added a "Live Share" section pointing future sessions at
  this file and at the cutover steps.

---

## Architectural notes for v3 maintenance

- **`createInitialState()`** now seeds `role: 'solo'`, `isShared: false`,
  `matchId: null`, `parentName: ""`, `parentHighlights: []`. v2.9.4 ignores
  these on autosave reads (additive fields), so cross-version localStorage
  resume works in both directions.
- **`autosaveState()`** persists `matchId` so a scorekeeper who refreshes the
  tab can resume an active share. `role` and `isShared` are deliberately NOT
  persisted — they're derived at load time from the URL or an explicit
  user action so a stale autosave can't silently re-enable network writes.
- **`sync` helper module** (vanilla JS, defined in the second `<script>` block,
  just before the Babel block) is the single place that touches Firebase.
  Every method returns a Promise and never throws synchronously; if Firebase
  is unconfigured or offline it resolves to null/false. All scorekeeper writes
  go through `firebase.database().ref().update({...})` multi-path updates so
  partial corruption isn't possible.
- **`mirrorIfShared(s, action)`** inside `VolleyballTracker` is the gate for
  every score-handler mirror. It checks `s.isShared && s.role === 'scorekeeper'`
  and wraps `action()` in try/catch.
- **Append vs. replace:** `scorePoint` and `reducePoint` use
  `sync.pushPoint` (one new child + meta patch). `undoLastPoint`,
  `toggleHighlight`, and `markHighlightWithNote` mutate existing entries, so
  they use `sync.replacePointLog` (rewrites the whole `points/` subtree with
  index-keyed children `p000000`, `p000001`, …). Replace is O(N) per call but
  these handlers fire infrequently.
- **Spectator subscribe:** `sync.subscribeMatch` registers one `value`
  listener on `/matches/{id}` and emits the entire snapshot on each update.
  The full payload is small (volleyball matches stay under 50 KB), so this is
  fine.
- **Throttling:** parent submissions are throttled to 1 per 15 s on the client
  (`PARENT_HIGHLIGHT_THROTTLE_MS`). The 140-char cap and 40-char name cap are
  enforced both client-side and via security rules.

---

## Cutover plan

When v3 has been tested live in a real match:

1. `git tag v2.9.4 && git push origin v2.9.4` — cheap rollback target.
2. `git mv index-v3.html index.html` — overwrites v2.9.4 in the deployed root.
3. (optional) Leave a 2-line `index-v3.html` containing
   `<meta http-equiv="refresh" content="0; url=index.html">` so any links
   shared during testing keep resolving.
4. The PWA manifest's `start_url` is `/`, so installed PWAs transparently
   pick up the new build on next launch — no manifest change needed.

Append the cutover commit hash and date to this file when it happens.

---

## Outstanding follow-ups

- Wire the Firebase project config (the placeholders in `FIREBASE_CONFIG` are
  empty strings — fill them in before testing live).
- Deploy `firebase-rules.json` to the Firebase console.
- Add a "watching: N" badge on the scorekeeper's Share button (uses
  `firebase.database().ref('.info/connected')` per spectator + a presence
  count). Out of scope for v3.0.0.
- Auto-cleanup of matches older than 30 days. Out of scope for v3.0.0; until
  the database fills up the Spark free tier handles a season's worth of data.
- Consider exposing a "stop sharing" toast that explains spectators will see
  the match as ended.
