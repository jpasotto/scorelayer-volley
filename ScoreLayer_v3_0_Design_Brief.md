# ScoreLayer Volley v3.0 — Multi-Segment Recording Support (Design Brief)

**Baseline:** v2.9.4
**Status:** Design draft — open decisions to finalize before implementation brief

## Problem statement

Camera recordings break mid-match (battery, storage, accidental stop). Today, ScoreLayer assumes one continuous video per match, so any restart either loses alignment or forces a destructive re-sync that corrupts pre-restart point offsets.

**Use case.** Match has N video segments (N ≥ 1), each with its own internal `00:00`. Each scored point belongs to exactly one segment. Exports must produce per-segment overlay artifacts so each video file gets correctly-aligned subtitles/MP4.

## Context

This brief was originally drafted as v2.9 before v2.9 was used for the inter-set QR marketing overlay (shipped in v2.9.0–v2.9.4). The multi-segment feature now targets v3.0 with no change to the core design decisions below.

Relevant v2.9.x changes that affect this brief:
- `pointLog` entries gained a `setWon: boolean` field (no impact on segment model)
- `syncTimestamp` is still a single scalar — the data model migration below is still needed
- All export generators updated for QR three-segment split but not segmentized yet

## Confirmed design decisions

| # | Decision | Confirmed |
|---|---|---|
| 1 | **Data model:** implicit segment derivation (Option A). Segment ownership computed from timestamp ranges; no schema change to `pointLog` entries | ✅ |
| 2 | **Sync UX:** live "Add sync point" button + retroactive editor (Option C); retroactive is the primary safety net | ✅ |
| 3 | **Retroactive editor:** point-based selection (B1); default offset = 0; optional fine-tune field | ✅ |
| 4 | **Segment labels:** captured at sync time, default "Segment N", used in exported filenames | ✅ |
| 5 | **Orphan points** (logged between segments, no video coverage): include in CSV + highlights, exclude from video overlays | ✅ |

## Data model

Replace `state.syncTimestamp: number | null` with:

```javascript
state.syncPoints = [
  { id: 1, wallClock: 1234567890000, label: "Segment 1" },
  { id: 2, wallClock: 1234571490000, label: "After battery swap" },
];
```

**Helper functions (new):**
- `getSegmentForPoint(point, syncPoints)` → returns segment id, or `null` for orphans (before first sync) and inter-segment orphans
- `getSegmentOffset(point, syncPoints)` → ms offset within owning segment
- `groupPointsBySegment(pointLog, syncPoints)` → `Map<segmentId, point[]>`

**Migration.** On autosave load, if legacy `syncTimestamp` exists, transform to `syncPoints: [{ id: 1, wallClock: syncTimestamp, label: "Segment 1" }]`. Clear `syncTimestamp`. Trivial, lossless. Also applies to v2.9.x autosaves (same scalar field).

## Per-format export implications

| Format | Change | Output |
|---|---|---|
| **SRT** | One file per segment, offsets rebased per segment | `scorelayer_<match>_segment1.srt`, `_segment2.srt`, … |
| **ASS** | Same as SRT | `_segment1.ass`, `_segment2.ass`, … |
| **FCPXML** | Same as SRT | `_segment1.fcpxml`, … |
| **CSV** | Single file (canonical record). Adds `Segment` and `SegmentOffset_ms` columns | One file (no segmentation) |
| **Chroma kit** | Folder per segment in ZIP, each containing `generate_overlay.sh` + README | `chroma_kit/segment1/…`, `chroma_kit/segment2/…` |
| **WebCodecs MP4** | One MP4 per segment, sequential encoding with progress UI per segment | `_segment1_overlay.mp4`, … |
| **YouTube Chapters** | One chapters file per segment (each starts at `00:00`) | `_segment1_chapters.txt`, … |
| **Highlights-only SRT** | Same as SRT — one per segment | `_segment1_highlights.srt`, … |

**UX implication.** The export modal needs a segment selector for video formats, OR a "download all segments" bulk action. Recommended: bulk by default, with a per-segment fallback for users who only need to re-render one.

**Note on QR overlay (v2.9):** the inter-set QR segment (type `'qr'`) is an entry within the overlay timeline, not a recording segment. The two concepts are independent — QR entries apply within each recording segment's own timeline.

## Open decisions to finalize

These need to be decided before the v3.0 implementation brief can be finalized.

### D1 — CSV schema migration

- **Option A (clean break):** Add `Segment` and `SegmentOffset_ms` columns. Drop `VideoOffset_ms`. Older v2.8/v2.9 CSVs become unimportable unless we add a migration path in `parseCSVToEntries`.
- **Option B (legacy alias):** Add `Segment` and `SegmentOffset_ms`. Keep `VideoOffset_ms` as alias of segment-1's offset, NULL for segment ≥ 2. Old CSVs still import, single-segment matches still produce backward-compatible output.

**Recommendation:** B. Forward and backward compatible, low cost.

### D2 — Retroactive editor UI placement

- **Option A:** New modal accessed from match-over screen via "Edit segments" button
- **Option B:** Inline in the point log: tap a point → context menu → "Mark as new segment start"
- **Option C:** Both

**Recommendation:** C — B for fast common-case + A for full management (rename, reorder, delete segments).

### D3 — Live "Add sync point" button affordance

- **Option A:** Replaces the current Sync button once initial sync is set; label changes to "+ Sync point"
- **Option B:** New separate button alongside the existing Sync indicator
- **Option C:** Long-press on the Sync indicator opens a menu

**Recommendation:** A — minimum cognitive load courtside, single button slot.

### D4 — Orphan point visual treatment in point log

- **Option A:** Greyed out with a "—" instead of timestamp
- **Option B:** Greyed out with "(no video)" label
- **Option C:** Yellow warning border + "(no video)" label

**Recommendation:** B — clear, low-noise.

### D5 — Fine-tune offset adjustment for retroactive sync

When the user retroactively marks a point as a new segment start, default offset is 0 (point happens at video time `00:00:00`). The fine-tune field allows entering ms or `mm:ss.ms`. Should we:

- **Option A:** Always show the offset field (more visible, more intimidating)
- **Option B:** Hide behind "Advanced" disclosure (cleaner default)

**Recommendation:** B.

### D6 — Bulk export naming convention

Current single-segment is `scorelayer_<match>.srt`. Proposed:

- Single-segment matches keep the legacy unsuffixed filename (e.g. `scorelayer_<match>.srt`)
- Multi-segment matches use numbered filenames (e.g. `scorelayer_<match>_segment1.srt`, `_segment2.srt`)

**Recommendation:** Conditional naming as above. Preserves backward compatibility for the dominant single-segment case.

### D7 — ZIP structure for chroma kit

When N > 1 segments, the chroma kit ZIP becomes:

```
chroma_kit/
  segment1/
    generate_overlay.sh
    README.txt
  segment2/
    generate_overlay.sh
    README.txt
  README_master.txt   ← explains the segment structure
```

vs. flat:

```
chroma_kit/
  generate_overlay_segment1.sh
  generate_overlay_segment2.sh
  README.txt
```

**Recommendation:** Folder-per-segment. Cleaner for the user to navigate, simpler shell script per file.

### D8 — Phasing if v3.0 proves too large

Estimated complexity is high (every export path touches segment grouping). Possible split:

- **v3.0.0:** Data model + UX + SRT/ASS/FCPXML/CSV/YouTube Chapters (all generators except video). Ships fast.
- **v3.0.1:** Chroma kit ZIP restructure + WebCodecs MP4 per-segment encoding. Ships after v3.0.0 is validated.

**Recommendation:** Split. WebCodecs path is the highest-risk component and should not block the simpler text-format work.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Backward compatibility broken for v2.7–v2.9 autosaves | Migration in `loadAutosave` (trivial) |
| CSV imports from older versions break | Decision D1 Option B preserves them |
| WebCodecs encoder state across sequential segment encodes | Each segment encoding gets a fresh muxer instance |
| User confusion about which MP4 maps to which video file | Segment label in filename + UI labels |
| Orphan point handling silently discards data | Decision D4: visible in log, included in CSV |
| QR inter-set entries interact with segment boundaries | QR entries live inside a segment timeline; no cross-segment QR window |

## Effort estimate

| Component | Complexity |
|---|---|
| Data model + migration | S |
| Segment derivation helpers | S |
| Retroactive editor (modal + log context menu) | M |
| Live "Add sync point" handler | S |
| All text-format generators (×6) refactor | M |
| CSV schema + parser | M |
| Chroma kit ZIP restructure | M |
| WebCodecs per-segment encoding | L |
| Test matrix | M |

**Total:** roughly 2× v2.8's scope. Splitting per D8 makes both halves shippable.

## Next steps

1. **Decide D1–D8.** Once finalized, this design brief converts to a formal implementation brief.
2. **v2.9.4 is the current baseline.** Validate multi-match real-world usage at this version before implementing v3.0.
3. **Adjacent dependency:** the federation-importer thread referenced in issue #11's "out of scope" section may need to be aware of the segment data model — flag for cross-check during v3.0 design freeze.
