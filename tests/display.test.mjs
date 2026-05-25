// Tier-1 display-mode unit tests.
// Tests the pure helper functions added to the EXPORTERS region of index.html:
//   getOrCreateDisplayId(storage), formatDisplayId(raw), parseDisplayParams(search)
// No browser, no Firebase, no network required.
import { test } from "node:test";
import assert from "node:assert/strict";
import { helpers } from "./harness.mjs";

const { getOrCreateDisplayId, formatDisplayId, parseDisplayParams, SCREEN } = helpers;

// ---------------------------------------------------------------------------
// getOrCreateDisplayId
// ---------------------------------------------------------------------------

test("getOrCreateDisplayId generates XXXX-XXXX format on first call", function() {
  const store = { _data: {}, getItem(k) { return this._data[k] ?? null; }, setItem(k, v) { this._data[k] = v; } };
  const id = getOrCreateDisplayId(store);
  assert.match(id, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/, "format must be XXXX-XXXX with uppercase alphanumeric");
});

test("getOrCreateDisplayId returns same id on subsequent calls with same storage", function() {
  const store = { _data: {}, getItem(k) { return this._data[k] ?? null; }, setItem(k, v) { this._data[k] = v; } };
  const id1 = getOrCreateDisplayId(store);
  const id2 = getOrCreateDisplayId(store);
  assert.equal(id1, id2, "should return the same id both times");
});

test("getOrCreateDisplayId uses existing id from storage when present", function() {
  const store = { _data: { scorelayer_display_id: "ABCD-1234" }, getItem(k) { return this._data[k] ?? null; }, setItem(k, v) { this._data[k] = v; } };
  const id = getOrCreateDisplayId(store);
  assert.equal(id, "ABCD-1234", "should return the pre-populated id from storage");
});

// ---------------------------------------------------------------------------
// formatDisplayId
// ---------------------------------------------------------------------------

test("formatDisplayId rejects strings not matching XXXX-XXXX pattern", function() {
  assert.equal(formatDisplayId("bad"), null);
  assert.equal(formatDisplayId("AB-12"), null);
  assert.equal(formatDisplayId("ABCDE-1234"), null);
  assert.equal(formatDisplayId(""), null);
  assert.equal(formatDisplayId(null), null);
  assert.equal(formatDisplayId(42), null);
});

test("formatDisplayId accepts valid uppercase XXXX-XXXX id unchanged", function() {
  assert.equal(formatDisplayId("ABCD-1234"), "ABCD-1234");
  assert.equal(formatDisplayId("Z9Z9-A1B2"), "Z9Z9-A1B2");
});

test("formatDisplayId normalises lowercase to uppercase", function() {
  assert.equal(formatDisplayId("abcd-1234"), "ABCD-1234");
  assert.equal(formatDisplayId("kxmb-7p2q"), "KXMB-7P2Q");
});

test("formatDisplayId strips surrounding whitespace before validating", function() {
  assert.equal(formatDisplayId("  ABCD-1234  "), "ABCD-1234");
});

// ---------------------------------------------------------------------------
// parseDisplayParams
// ---------------------------------------------------------------------------

test("parseDisplayParams: ?tv with no value → DISPLAY screen, displayId null", function() {
  const r = parseDisplayParams("?tv");
  assert.equal(r.screen, SCREEN.DISPLAY);
  assert.equal(r.matchId, null);
  assert.equal(r.displayId, null);
  assert.equal(r.pairId, null);
});

test("parseDisplayParams: ?tv=ABCD-1234 → DISPLAY screen with displayId", function() {
  const r = parseDisplayParams("?tv=ABCD-1234");
  assert.equal(r.screen, SCREEN.DISPLAY);
  assert.equal(r.displayId, "ABCD-1234");
  assert.equal(r.pairId, null);
  assert.equal(r.matchId, null);
});

test("parseDisplayParams: ?pair=ABCD-1234 → PAIR screen with pairId", function() {
  const r = parseDisplayParams("?pair=ABCD-1234");
  assert.equal(r.screen, SCREEN.PAIR);
  assert.equal(r.pairId, "ABCD-1234");
  assert.equal(r.displayId, null);
  assert.equal(r.matchId, null);
});

test("parseDisplayParams: ?m=matchABC → SPECTATOR screen with matchId", function() {
  const r = parseDisplayParams("?m=matchABC");
  assert.equal(r.screen, SCREEN.SPECTATOR);
  assert.equal(r.matchId, "matchABC");
  assert.equal(r.displayId, null);
  assert.equal(r.pairId, null);
});

test("parseDisplayParams: no params → SETUP screen", function() {
  const r = parseDisplayParams("");
  assert.equal(r.screen, SCREEN.SETUP);
  assert.equal(r.matchId, null);
  assert.equal(r.displayId, null);
  assert.equal(r.pairId, null);
});
