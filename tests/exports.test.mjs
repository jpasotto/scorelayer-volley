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

// ---------- helpers ----------

function parseSrtTime(s) {
  // "HH:MM:SS,mmm" → ms
  const [hms, mmm] = s.split(",");
  const [h, m, sec] = hms.split(":").map(Number);
  return h * 3_600_000 + m * 60_000 + sec * 1000 + Number(mmm);
}
