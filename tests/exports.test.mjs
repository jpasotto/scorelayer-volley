// Tier-1 unit tests for the export pipeline. Run with: `node --test tests/`
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { helpers } from "./harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "fixtures", "sample-match.json"), "utf8")
);
const { syncTimestamp, teamA, teamB, matchTitle, setNumberOffset, pointLog, parentHighlights } = fixture;

const STAR = "★"; // scorekeeper highlight prefix
const SPARKLE = "⭐"; // parent highlight prefix

// ---------- buildYouTubeChapterList ----------

test("buildYouTubeChapterList: empty pointLog + empty parentHighlights → only Match Start", () => {
  const out = helpers.buildYouTubeChapterList([], syncTimestamp, teamA, teamB, 0, []);
  assert.equal(out.length, 1);
  assert.equal(out[0].timeMs, 0);
  assert.equal(out[0].text, "Match Start");
});

test("buildYouTubeChapterList: scorekeeper highlight produces a chapter at the right MM:SS", () => {
  const out = helpers.buildYouTubeChapterList(pointLog, syncTimestamp, teamA, teamB, 0, []);
  const greatSpike = out.find((c) => c.text.includes("Great spike"));
  assert.ok(greatSpike, "expected a chapter for the Great spike highlight");
  assert.equal(greatSpike.timeMs, 90000);
  assert.equal(helpers.msToChapterTime(greatSpike.timeMs), "1:30");
  assert.ok(greatSpike.text.startsWith(STAR));
});

test("buildYouTubeChapterList: deleted parent highlight is excluded", () => {
  const out = helpers.buildYouTubeChapterList(pointLog, syncTimestamp, teamA, teamB, 0, parentHighlights);
  assert.ok(!out.some((c) => c.text.includes("Should be hidden")));
  assert.ok(!out.some((c) => c.text.includes("Mallory")));
});

test("buildYouTubeChapterList: parent highlight colliding with existing chapter is bumped by +1000ms", () => {
  // Set 1 starts at 30s; place a parent highlight at the exact same offset.
  const colliding = [{ clientTimestamp: syncTimestamp + 30000, name: "Pat", note: "same time", deleted: false }];
  const out = helpers.buildYouTubeChapterList(pointLog, syncTimestamp, teamA, teamB, 0, colliding);
  const pat = out.find((c) => c.text.includes("Pat"));
  assert.ok(pat, "expected Pat's chapter to appear");
  assert.equal(pat.timeMs, 31000, "collision should bump by +1000ms (1s)");
});

test("buildYouTubeChapterList: parent highlights with negative offsets are dropped", () => {
  const negative = [
    { clientTimestamp: syncTimestamp - 5000, name: "Early", note: "before sync", deleted: false },
    { clientTimestamp: syncTimestamp + 100000, name: "Alice", note: "Big rally", deleted: false },
  ];
  const out = helpers.buildYouTubeChapterList(pointLog, syncTimestamp, teamA, teamB, 0, negative);
  assert.ok(!out.some((c) => c.text.includes("Early")));
  assert.ok(out.some((c) => c.text.includes("Alice")));
});

test("buildYouTubeChapterList: output is strictly ascending by timeMs", () => {
  const out = helpers.buildYouTubeChapterList(pointLog, syncTimestamp, teamA, teamB, 0, parentHighlights);
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i].timeMs > out[i - 1].timeMs, `chapter ${i} not strictly after chapter ${i - 1}`);
  }
});

test("buildYouTubeChapterList: realistic match passes validateYouTubeChapters", () => {
  const out = helpers.buildYouTubeChapterList(pointLog, syncTimestamp, teamA, teamB, 0, parentHighlights);
  const result = helpers.validateYouTubeChapters(out);
  assert.equal(result.valid, true, `expected valid; got errors: ${result.errors.join(" | ")}`);
  assert.equal(result.errors.length, 0);
});

test("buildYouTubeChapterList: #51 — later set-1 highlight keeps its true offset when set 1 starts at 0:00", () => {
  const sync = 1700000000000;
  const log = [
    // Set 1 first point within 1s of sync → set1AtZero = true
    { timestamp: sync + 800,   setNum: 1, pointsA: 1, pointsB: 0, highlight: false, highlightNote: null },
    // Mid-set highlight ~16s in → must NOT collapse to 0:00 (the original bug)
    { timestamp: sync + 16159, setNum: 1, pointsA: 2, pointsB: 0, highlight: true,  highlightNote: "Great spike" },
    { timestamp: sync + 30000, setNum: 1, pointsA: 3, pointsB: 0, highlight: false, highlightNote: null },
  ];
  const out = helpers.buildYouTubeChapterList(log, sync, "Home", "Away", 0, []);
  const hl = out.find((c) => c.text.includes("Great spike"));
  assert.ok(hl, "expected the mid-set highlight chapter");
  assert.equal(hl.timeMs, 16159, "later set-1 highlight must keep its true offset, not 0:00");
  // Only the "Set 1 Start" chapter belongs at 0:00.
  assert.equal(out.filter((c) => c.timeMs === 0).length, 1, "no spurious 0:00 highlight chapter");
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i].timeMs > out[i - 1].timeMs, "chapters strictly ascending");
  }
});

test("buildYouTubeChapterList: #51 — first-point set-1 highlight does not create a duplicate 0:00 chapter", () => {
  const sync = 1700000000000;
  const log = [
    { timestamp: sync + 500,   setNum: 1, pointsA: 1, pointsB: 0, highlight: true,  highlightNote: "Opening ace" },
    { timestamp: sync + 30000, setNum: 1, pointsA: 2, pointsB: 0, highlight: false, highlightNote: null },
  ];
  const out = helpers.buildYouTubeChapterList(log, sync, "Home", "Away", 0, []);
  const atZero = out.filter((c) => c.timeMs === 0);
  assert.equal(atZero.length, 1, "only the Set 1 Start chapter should sit at 0:00");
  assert.equal(atZero[0].text, "Set 1 Start", "the single 0:00 chapter is the set start, not the highlight");
});

// ---------- generateCSV ----------

test("generateCSV: each point produces one row with the documented columns", () => {
  const csv = helpers.generateCSV(pointLog, syncTimestamp, teamA, teamB, "title", []);
  const lines = csv.split("\n");
  assert.equal(lines[0], "Index,WallClock,VideoOffset_ms,Set,PointsA,PointsB,SetsA,SetsB,ScoringTeam,Correction,Highlight,HighlightNote,MatchTitle,ScoreDisplay");
  assert.equal(lines.length, 1 + pointLog.length, "header + one row per point");
  // First point row: Index=1, scoring team is teamA, no highlight, no correction.
  assert.ok(lines[1].startsWith("1,"));
  assert.ok(lines[1].includes("," + teamA + ","));
});

test("generateCSV: parent highlights emit additional rows with ScoringTeam=PARENT", () => {
  const csv = helpers.generateCSV(pointLog, syncTimestamp, teamA, teamB, "title", parentHighlights);
  const lines = csv.split("\n");
  const parentRows = lines.filter((l) => l.includes(",PARENT,"));
  assert.equal(parentRows.length, 2, "two visible parent highlights expected (Alice, Bob; Mallory deleted)");
  assert.ok(parentRows.some((r) => r.includes("Alice: Big rally")));
  assert.ok(parentRows.some((r) => r.includes("Bob: Net violation?")));
  assert.ok(!lines.some((l) => l.includes("Should be hidden")));
});

test("generateCSV: matchTitle is CSV-escaped (quotes doubled, commas wrapped)", () => {
  const tricky = 'He said "go", I went';
  const csv = helpers.generateCSV(pointLog, syncTimestamp, teamA, teamB, tricky, []);
  // Each row's MatchTitle column is wrapped in quotes; embedded quotes are doubled per RFC 4180.
  assert.ok(csv.includes('"He said ""go"", I went"'));
});

// ---------- generateSRT / generateHighlightsSRT ----------

test("generateSRT: cue indices are 1-based and contiguous", () => {
  const srt = helpers.generateSRT(pointLog, syncTimestamp, teamA, teamB, 0);
  // SRT cues are blank-line separated; first line of each cue is the index.
  const cues = srt.split("\n\n").filter((b) => b.trim().length > 0);
  cues.forEach((cue, i) => {
    const firstLine = cue.split("\n")[0];
    assert.equal(firstLine, String(i + 1), `cue ${i} should have index ${i + 1}, got "${firstLine}"`);
  });
});

test("generateSRT: timecode format is HH:MM:SS,mmm (comma, not period)", () => {
  const srt = helpers.generateSRT(pointLog, syncTimestamp, teamA, teamB, 0);
  const timeLines = srt.split("\n").filter((l) => l.includes("-->"));
  assert.ok(timeLines.length > 0);
  const re = /^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/;
  timeLines.forEach((l) => assert.match(l, re));
});

test("generateHighlightsSRT: merges parent highlights and sorts by startMs", () => {
  const srt = helpers.generateHighlightsSRT(pointLog, syncTimestamp, teamA, teamB, 0, parentHighlights);
  assert.ok(srt.includes("Alice: Big rally"));
  assert.ok(srt.includes("Bob: Net violation?"));
  assert.ok(!srt.includes("Should be hidden"));
  // Verify ordering: parse the start times and confirm ascending.
  const starts = srt
    .split("\n")
    .filter((l) => l.includes("-->"))
    .map((l) => l.split(" --> ")[0]);
  for (let i = 1; i < starts.length; i++) {
    assert.ok(starts[i] >= starts[i - 1], `entry ${i} starts before ${i - 1}`);
  }
});

test("generateHighlightsSRT: parent highlights get an 8-second window", () => {
  const srt = helpers.generateHighlightsSRT(pointLog, syncTimestamp, teamA, teamB, 0, parentHighlights);
  // Find Alice's cue and parse its time line. Alice = ⭐ prefix.
  const cues = srt.split("\n\n").filter((b) => b.includes("Alice"));
  assert.equal(cues.length, 1);
  const timeLine = cues[0].split("\n").find((l) => l.includes("-->"));
  const [start, end] = timeLine.split(" --> ").map(parseSrtTime);
  assert.equal(end - start, 8000, "parent-highlight window should be exactly 8s");
});

// ---------- msToChapterTime ----------

test("msToChapterTime: returns MM:SS below 1h, H:MM:SS at/above 1h, with the boundary at 60min", () => {
  assert.equal(helpers.msToChapterTime(0), "0:00");
  assert.equal(helpers.msToChapterTime(59_000), "0:59");
  assert.equal(helpers.msToChapterTime(60_000), "1:00");
  assert.equal(helpers.msToChapterTime(3_599_000), "59:59");
  assert.equal(helpers.msToChapterTime(3_600_000), "1:00:00");
  assert.equal(helpers.msToChapterTime(3_661_000), "1:01:01");
});

// ---------- buildOverlayEntries ----------

test("buildOverlayEntries: regression #35 — rally-before-highlight not dropped; ★ propagated back", () => {
  // 5-point pointLog, set 1, synced at a real epoch timestamp
  const sync = 1700000000000; // non-zero so the falsy guard passes
  const log = [
    { timestamp: sync + 100000, setNum: 1, pointsA: 1, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 200000, setNum: 1, pointsA: 2, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 300000, setNum: 1, pointsA: 3, pointsB: 0, setsA: 0, setsB: 0, highlight: true,  highlightNote: "Great play" },
    { timestamp: sync + 400000, setNum: 1, pointsA: 4, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 500000, setNum: 1, pointsA: 5, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
  ];

  const entries = helpers.buildOverlayEntries(log, sync, "Home", "Away", "Test", 0);

  // All entries must pass end > start (none collapsed/dropped)
  entries.forEach((e, i) => {
    assert.ok(e.end > e.start, `entry ${i} has end <= start (collapsed): start=${e.start} end=${e.end}`);
  });

  // The entry showing "2 : 0" (pre-rally score) should have highlight: true
  const score2 = entries.find(e => e.score && e.score.includes("2 : 0"));
  assert.ok(score2, "expected an entry with score 2 : 0");
  assert.equal(score2.highlight, true, "entry with 2 : 0 should have highlight: true (★ propagated back)");

  // The entry showing "3 : 0" (scoring point) should also have highlight: true
  const score3 = entries.find(e => e.score && e.score.includes("3 : 0"));
  assert.ok(score3, "expected an entry with score 3 : 0");
  assert.equal(score3.highlight, true, "entry with 3 : 0 should have highlight: true");

  // No gap: score2's end should equal score3's start
  assert.equal(score2.end, score3.start, "no gap: 2:0 entry end must equal 3:0 entry start");
});

test("buildOverlayEntries: non-highlight pointLog → all score entries have highlight: false", () => {
  const sync = 1700000000000;
  const log = [
    { timestamp: sync + 100000, setNum: 1, pointsA: 1, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 200000, setNum: 1, pointsA: 2, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 300000, setNum: 1, pointsA: 3, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
  ];

  const entries = helpers.buildOverlayEntries(log, sync, "Home", "Away", "Test", 0);
  const scoreEntries = entries.filter(e => e.type === 'score');
  assert.equal(scoreEntries.length, 3, "expected 3 score entries");
  scoreEntries.forEach((e, i) => {
    assert.equal(e.highlight, false, `entry ${i} should have highlight: false`);
  });
});

test("buildOverlayEntries: parent highlight marks the score entry whose window contains its timestamp", () => {
  const sync = 1700000000000;
  const log = [
    { timestamp: sync + 100000, setNum: 1, pointsA: 1, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 200000, setNum: 1, pointsA: 2, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 300000, setNum: 1, pointsA: 3, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
  ];
  // Parent submits at sync + 250s — falls inside the second score entry's window.
  const ph = [
    { clientTimestamp: sync + 250000, name: "Alice", note: "Big rally", tag: "ace", deleted: false },
  ];
  const entries = helpers.buildOverlayEntries(log, sync, "Home", "Away", "Test", 0, ph);
  const target = entries.find(e => e.type === "score" && e.score && e.score.includes("2 : 0"));
  assert.ok(target, "expected entry for score 2 : 0");
  assert.equal(target.highlight, true, "parent highlight should flip the matching entry to highlight=true");
  assert.ok(target.highlightNote && target.highlightNote.includes("Alice"), "highlightNote should include the parent name");
  assert.ok(target.highlightNote.includes("Ace"), "highlightNote should include the tag label");
  assert.ok(target.highlightNote.includes("Big rally"), "highlightNote should include the parent note");
});

test("buildOverlayEntries: deleted parent highlights are ignored", () => {
  const sync = 1700000000000;
  const log = [
    { timestamp: sync + 100000, setNum: 1, pointsA: 1, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 200000, setNum: 1, pointsA: 2, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
  ];
  const ph = [
    { clientTimestamp: sync + 150000, name: "Mallory", note: "noise", deleted: true },
  ];
  const entries = helpers.buildOverlayEntries(log, sync, "Home", "Away", "Test", 0, ph);
  entries.filter(e => e.type === "score").forEach(e => {
    assert.equal(e.highlight, false, "no entry should be flagged when the only parent highlight is deleted");
  });
});

test("buildOverlayEntries: parent highlight with negative offset is ignored", () => {
  const sync = 1700000000000;
  const log = [
    { timestamp: sync + 100000, setNum: 1, pointsA: 1, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
  ];
  const ph = [{ clientTimestamp: sync - 5000, name: "Early", note: "pre-sync", deleted: false }];
  const entries = helpers.buildOverlayEntries(log, sync, "Home", "Away", "Test", 0, ph);
  entries.filter(e => e.type === "score").forEach(e => {
    assert.equal(e.highlight, false, "negative-offset parent highlight must not mark any entry");
  });
});

test("buildOverlayEntries: parent highlight on a scorekeeper-starred entry appends with ' + ' rather than overwriting", () => {
  const sync = 1700000000000;
  const log = [
    { timestamp: sync + 100000, setNum: 1, pointsA: 1, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 200000, setNum: 1, pointsA: 2, pointsB: 0, setsA: 0, setsB: 0, highlight: true,  highlightNote: "Great spike" },
    { timestamp: sync + 300000, setNum: 1, pointsA: 3, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
  ];
  // Parent presses within the scorekeeper star window (issue #51 caps the ★ to
  // OVERLAY_STAR_SEC after the score appears at +200s), so this is genuine
  // agreement on the same moment and must append rather than overwrite.
  const ph = [{ clientTimestamp: sync + 202000, name: "Alice", note: "agreed", deleted: false }];
  const entries = helpers.buildOverlayEntries(log, sync, "Home", "Away", "Test", 0, ph);
  const target = entries.find(e => e.type === "score" && e.score && e.score.includes("2 : 0") && e.highlight);
  assert.ok(target, "expected highlighted score 2 : 0 entry");
  assert.ok(target.highlightNote.includes("Great spike"), "original scorekeeper note must be preserved");
  assert.ok(target.highlightNote.includes("Alice"), "parent name must be appended");
  assert.ok(target.highlightNote.includes(" + "), "join must use ' + ' delimiter");
});

test("buildOverlayEntries: omitting parentHighlights arg leaves output unchanged (back-compat)", () => {
  const sync = 1700000000000;
  const log = [
    { timestamp: sync + 100000, setNum: 1, pointsA: 1, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 200000, setNum: 1, pointsA: 2, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
  ];
  const without = helpers.buildOverlayEntries(log, sync, "Home", "Away", "Test", 0);
  const withEmpty = helpers.buildOverlayEntries(log, sync, "Home", "Away", "Test", 0, []);
  assert.deepEqual(without, withEmpty, "no-arg and empty-array forms must produce identical output");
});

test("buildOverlayEntries: set-boundary guard — highlight on first point of set 2 does not propagate to last entry of set 1", () => {
  const sync = 1700000000000;
  const log = [
    { timestamp: sync + 100000, setNum: 1, pointsA: 1, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 200000, setNum: 1, pointsA: 2, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    // First point of set 2 with highlight — must NOT back-propagate to set 1
    { timestamp: sync + 300000, setNum: 2, pointsA: 1, pointsB: 0, setsA: 1, setsB: 0, highlight: true,  highlightNote: "Ace" },
    { timestamp: sync + 400000, setNum: 2, pointsA: 2, pointsB: 0, setsA: 1, setsB: 0, highlight: false, highlightNote: null },
  ];

  const entries = helpers.buildOverlayEntries(log, sync, "Home", "Away", "Test", 0);

  // Find the last set-1 score entry
  const set1Entries = entries.filter(e => e.type === 'score' && e.set_info && e.set_info.includes("1"));
  assert.ok(set1Entries.length > 0, "expected at least one set-1 score entry");
  const lastSet1 = set1Entries[set1Entries.length - 1];
  assert.equal(lastSet1.highlight, false, "last set-1 entry must keep highlight: false (cross-set propagation blocked)");
});

test("buildOverlayEntries: #51 — highlighted score entry splits into lit head (~5s) + unlit tail", () => {
  const sync = 1700000000000;
  const log = [
    { timestamp: sync + 4000,  setNum: 1, pointsA: 9,  pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 16000, setNum: 1, pointsA: 10, pointsB: 0, setsA: 0, setsB: 0, highlight: true,  highlightNote: "Great spike" },
    { timestamp: sync + 28000, setNum: 1, pointsA: 11, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
  ];
  const entries = helpers.buildOverlayEntries(log, sync, "Home", "Away", "Test", 0);
  entries.forEach((e, i) => assert.ok(e.end > e.start, `entry ${i} collapsed`));

  const tenZero = entries.filter((e) => e.type === "score" && e.score && e.score.includes("10 : 0"));
  assert.equal(tenZero.length, 2, "highlighted 10:0 score should split into lit head + unlit tail");
  const head = tenZero[0], tail = tenZero[1];
  assert.equal(head.highlight, true, "head is lit");
  assert.equal(tail.highlight, false, "tail is unlit");
  assert.equal(head.highlightNote, "Great spike");
  assert.equal(tail.highlightNote, null);
  assert.ok(Math.abs((head.end - head.start) - helpers.OVERLAY_STAR_SEC) < 0.001, "head ≈ OVERLAY_STAR_SEC long");
  assert.equal(head.end, tail.start, "head and tail must be contiguous");
  // The rally (9:0) entry stays fully lit via #35 back-propagation
  const nineZero = entries.find((e) => e.type === "score" && e.score && e.score.includes("9 : 0"));
  assert.equal(nineZero.highlight, true, "rally entry stays lit");
});

test("buildOverlayEntries: #51 — short highlighted entry (<= star window) stays a single lit entry", () => {
  const sync = 1700000000000;
  const log = [
    { timestamp: sync + 4000, setNum: 1, pointsA: 1, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 8000, setNum: 1, pointsA: 2, pointsB: 0, setsA: 0, setsB: 0, highlight: true,  highlightNote: "Quick" },
    { timestamp: sync + 11000, setNum: 1, pointsA: 3, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
  ];
  const entries = helpers.buildOverlayEntries(log, sync, "Home", "Away", "Test", 0);
  const twoZero = entries.filter((e) => e.type === "score" && e.score && e.score.includes("2 : 0"));
  assert.equal(twoZero.length, 1, "short highlighted entry must not split");
  assert.equal(twoZero[0].highlight, true);
});

test("buildOverlayEntries: #51 — parent highlight on a long entry produces lit head + unlit tail", () => {
  const sync = 1700000000000;
  const log = [
    { timestamp: sync + 4000,  setNum: 1, pointsA: 1, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 16000, setNum: 1, pointsA: 2, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 40000, setNum: 1, pointsA: 3, pointsB: 0, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
  ];
  const ph = [{ clientTimestamp: sync + 18000, name: "Alice", note: "Big rally", deleted: false }];
  const entries = helpers.buildOverlayEntries(log, sync, "Home", "Away", "Test", 0, ph);
  entries.forEach((e, i) => assert.ok(e.end > e.start, `entry ${i} collapsed`));
  const twoZero = entries.filter((e) => e.type === "score" && e.score && e.score.includes("2 : 0"));
  assert.equal(twoZero.length, 2, "parent-marked long entry should split into head + tail");
  assert.equal(twoZero[0].highlight, true, "head is lit");
  assert.ok(twoZero[0].highlightNote.includes("Alice"), "head note includes parent name");
  assert.ok(Math.abs((twoZero[0].end - twoZero[0].start) - helpers.OVERLAY_STAR_SEC) < 0.001, "head ≈ OVERLAY_STAR_SEC long");
  assert.equal(twoZero[1].highlight, false, "tail is unlit");
  assert.equal(twoZero[0].end, twoZero[1].start, "head and tail must be contiguous");
});

test("buildOverlayEntries: spectator highlight back-propagates the ★ to the rally (previous) entry", () => {
  // Mirrors the scorekeeper behavior: a parent who taps just after the score
  // appears should also light the play that produced it (the previous point's
  // entry), not only the 5s tail on the new score.
  const sync = 1700000000000;
  const log = [
    { timestamp: sync + 4000,  setNum: 1, pointsA: 0, pointsB: 18, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 16000, setNum: 1, pointsA: 0, pointsB: 19, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 40000, setNum: 1, pointsA: 0, pointsB: 20, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
    { timestamp: sync + 52000, setNum: 1, pointsA: 0, pointsB: 21, setsA: 0, setsB: 0, highlight: false, highlightNote: null },
  ];
  // Parent taps just after 0-20 appears (entry window [40s, 52s]).
  const ph = [{ clientTimestamp: sync + 42000, name: "Dad", note: "Nice dig", deleted: false }];
  const entries = helpers.buildOverlayEntries(log, sync, "Home", "Away", "Test", 0, ph);
  entries.forEach((e, i) => assert.ok(e.end > e.start, `entry ${i} collapsed`));

  // Rally entry (0-19) — the play that produced 0-20 — must be lit for its full duration.
  const rally = entries.filter((e) => e.type === "score" && e.score && e.score.includes("0 : 19"));
  assert.equal(rally.length, 1, "rally entry must not be split");
  assert.equal(rally[0].highlight, true, "rally (0-19) entry must be lit via back-propagation");
  assert.ok(rally[0].highlightNote && rally[0].highlightNote.includes("Dad"), "rally note carries the parent blurb");

  // Matched entry (0-20) gets the capped 5s lit head.
  const twentyHead = entries.find((e) => e.type === "score" && e.score && e.score.includes("0 : 20") && e.highlight);
  assert.ok(twentyHead, "0-20 entry should have a lit head");
  assert.ok(Math.abs((twentyHead.end - twentyHead.start) - helpers.OVERLAY_STAR_SEC) < 0.001, "head ≈ OVERLAY_STAR_SEC long");

  // The earlier point (0-18) must stay unlit.
  const eighteen = entries.find((e) => e.type === "score" && e.score && e.score.includes("0 : 18"));
  assert.equal(eighteen.highlight, false, "points before the rally stay unlit");
});

// ---------- helpers ----------

function parseSrtTime(s) {
  // "HH:MM:SS,mmm" → ms
  const [hms, mmm] = s.split(",");
  const [h, m, sec] = hms.split(":").map(Number);
  return h * 3_600_000 + m * 60_000 + sec * 1000 + Number(mmm);
}
