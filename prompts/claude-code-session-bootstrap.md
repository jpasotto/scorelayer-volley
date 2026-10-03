# Session bootstrap prompt (Claude Code)

Paste the block below as the first message of a new Claude Code session opened in a
local clone of this repository. It is deliberately machine-agnostic: nothing in it
depends on a particular computer, path, account or toolchain beyond Git, the GitHub
CLI (`gh`) and Node 20+.

---

```text
You are working on ScoreLayer Volley, a single-file PWA (index.html) for live
volleyball scoring with timestamped exports and Firebase-backed Live Share.

1. Orient before changing anything
   - Read CLAUDE.md and README.md in full. CLAUDE.md is the architecture guide:
     single index.html, React 18 UMD + in-browser Babel, no build step, no npm.
   - Run `git status`, `git fetch origin` and `git log --oneline -10 origin/main`.
     If the local checkout is behind origin/main and the tree is clean,
     fast-forward it; otherwise stop and tell me what is uncommitted.
   - List open issues and PRs (`gh issue list`, `gh pr list`) and summarise them
     briefly, most recently active first.
   - Run the test suite: `node --test tests/*.test.mjs`. Report the result.

2. Ground rules
   - Pushing to `main` deploys to production (GitHub Pages) immediately and is
     what real users load on their phones, sometimes mid-match. Never push to
     `main` directly: work on a feature branch, open a PR, and merge only when I
     say so.
   - Keep the single-file architecture. Do not introduce a bundler, npm
     dependencies or a backend unless I explicitly ask.
   - Any change to the export generators must keep the code between the
     `// EXPORTERS_BEGIN` / `// EXPORTERS_END` sentinels loadable by
     tests/harness.mjs, and should come with a test in tests/exports.test.mjs.
   - Bump APP_VERSION for user-visible changes and keep the README's manual
     section in sync with UI changes.
   - The repository is public. Never commit secrets, personal data, team or
     player names from real matches, or details of anyone's local setup. The
     Firebase web config in index.html is public by design; security relies on
     firebase-rules.json, so treat rule changes as security-sensitive.

3. Reliability expectations (the app is used live, on a phone, during a match)
   - Every async path the user waits on (Firebase sign-in, RTDB writes,
     WebCodecs encoding/flush, file sharing) must have a timeout and a visible,
     retryable error. Never leave a spinner with no way out, and never cache a
     promise that has not resolved successfully.
   - A Cancel/close control must always stay enabled.
   - Scoring, undo and autosave must keep working when the network or any
     export fails. Do not change the autosave key or the restore flow without
     a migration.
   - Assume iOS Safari as the primary target, including the tab being
     backgrounded for long periods and then resumed.

4. Testing a change
   - Unit tests: `node --test tests/*.test.mjs`.
   - Manual: serve the repo root with any static server
     (e.g. `python3 -m http.server 8080`) and open it in a browser; use a
     phone on the same network, or a browser's device emulation, for the
     mobile layout. Live Share needs two clients (scorekeeper + spectator via
     the `?m=` link).
   - Describe in the PR what was tested manually and on which browser.

When you have done step 1, summarise the current state back to me and ask
what to work on.
```
