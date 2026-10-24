// Spectator set-break display and the "support the project" card rules.
// Run with: `node --test tests/`
import { test } from "node:test";
import assert from "node:assert/strict";
import { helpers } from "./harness.mjs";

const DAY = 24 * 3600 * 1000;
const NOW = 1_800_000_000_000;
// Objects built inside the harness vm have another realm's prototype.
const plain = (o) => (o === null ? null : { ...o });

function closing(setNum, a, b, extra = {}) {
  return { setNum, pointsA: a, pointsB: b, setWon: true, correction: false, ...extra };
}
function breakState(over = {}) {
  return {
    matchStarted: true, matchOver: false, currentSet: 3, pointsA: 0, pointsB: 0,
    pointLog: [closing(1, 25, 20), closing(2, 21, 25)],
    ...over,
  };
}

test("set break returns the score of the set that just ended, not 0-0", () => {
  assert.deepEqual(plain(helpers.getSpectatorSetBreak(breakState())), { setNum: 2, scoreA: 21, scoreB: 25 });
});

test("no set break while points are being played, before the match, or after it", () => {
  assert.equal(helpers.getSpectatorSetBreak(breakState({ pointsA: 1 })), null);
  assert.equal(helpers.getSpectatorSetBreak(breakState({ matchStarted: false })), null);
  assert.equal(helpers.getSpectatorSetBreak(breakState({ matchOver: true })), null);
  assert.equal(helpers.getSpectatorSetBreak(breakState({ currentSet: 1, pointLog: [] })), null);
  assert.equal(helpers.getSpectatorSetBreak(null), null);
});

test("set break needs the closing entry of the previous set; ignores corrections and other sets", () => {
  assert.equal(helpers.getSpectatorSetBreak(breakState({ pointLog: [closing(1, 25, 20)] })), null);
  assert.equal(
    helpers.getSpectatorSetBreak(breakState({ pointLog: [closing(2, 99, 0, { correction: true })] })),
    null
  );
  // Order of the log does not matter (spectator logs can be out of order, #67).
  const out = breakState({ pointLog: [closing(2, 21, 25), { setNum: 1, pointsA: 3, pointsB: 1 }, closing(1, 25, 20)] });
  assert.deepEqual(plain(helpers.getSpectatorSetBreak(out)), { setNum: 2, scoreA: 21, scoreB: 25 });
});

test("support card: allowed by default, capped at 2 per match", () => {
  assert.equal(helpers.spectatorSupportAllowed({}, NOW, 0), true);
  assert.equal(helpers.spectatorSupportAllowed(undefined, NOW, 1), true);
  assert.equal(helpers.spectatorSupportAllowed({}, NOW, 2), false);
});

test("support card: silent for 14 days after dismiss, 90 after donating", () => {
  assert.equal(helpers.spectatorSupportAllowed({ dismissedAt: NOW - 13 * DAY }, NOW, 0), false);
  assert.equal(helpers.spectatorSupportAllowed({ dismissedAt: NOW - 15 * DAY }, NOW, 0), true);
  assert.equal(helpers.spectatorSupportAllowed({ donatedAt: NOW - 89 * DAY }, NOW, 0), false);
  assert.equal(helpers.spectatorSupportAllowed({ donatedAt: NOW - 91 * DAY }, NOW, 0), true);
});

test("highlight threshold is the 3rd submission", () => {
  assert.equal(helpers.SPECTATOR_SUPPORT_HIGHLIGHT_COUNT, 3);
});
