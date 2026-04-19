# ScoreLayer Volley v2 — Implementation Brief
## Client-Side Green-Screen MP4 Generation via WebCodecs

**Prepared for:** Claude Opus (implementation session)  
**Author:** Jan Pasotto  
**Date:** 2026-03-15  
**Repo:** https://github.com/jpasotto/scorelayer-volley  
**Live PWA:** https://jpasotto.github.io/scorelayer-volley/

---

## 1. Objective

Replace the current shell script + Python + FFmpeg chroma key pipeline with a fully in-browser MP4 generator using the **WebCodecs API** + a pure-JS MP4 muxer.

The user currently downloads a `.zip` containing a bash script they must run locally (requires `brew install ffmpeg python3 && pip3 install Pillow`). The goal is to eliminate all local dependencies and generate the green-screen overlay MP4 directly in the browser.

**Deliverable:** A modified `index.html` where the "Download Chroma Kit (.zip)" button is replaced by a "Generate Overlay MP4" button that encodes and downloads a `.mp4` file entirely client-side, with no backend, no shell script, no Python.

---

## 2. Current Architecture

The app is a **single `index.html`** file with:

- `<style>` tag: all CSS (CRITICAL: CSS must never be placed in JS template literals — Babel standalone silently fails on them, producing a black page)
- `<script>` tag (pure JS, ~577 lines): helpers, volleyball rules, all export generators (`generateSRT`, `generateCSV`, `generateFCPXML`, `generateASS`, `generateChromaScript`, `generateReadme`, `buildZip`, `crc32`)
- `<script type="text/babel">` tag (~400 lines): React 18 component with JSX, transpiled in-browser by Babel standalone
- React 18 and Babel standalone loaded from unpkg CDN
- Deployment: GitHub Pages via GitHub Actions (push to `main` → auto-deploy)

**Key constraint:** No build step. Everything runs in the browser as-is. No npm, no Webpack, no bundler. CDN-only external dependencies.

---

## 3. Current Chroma Key Data Structure

The existing `generateChromaScript()` function already produces the frame data needed. It builds a `entries` array with this shape:

```javascript
entries = [
  {
    start: 0.0,       // seconds from sync point (float)
    end: 4.312,       // seconds
    score: "Roma  12 : 9  Lazio",
    set_info: "Set 2"
  },
  // ... one entry per score change, ~100-200 entries per match
]
```

This is the input to the new MP4 generator. The keyframe-based approach is the key performance optimization: instead of encoding every video frame independently, each `entry` defines a time range during which the canvas content is static. You render once per entry, hold that frame for the duration, then advance.

Total duration is `Math.ceil((lastEntry.timestamp - syncTimestamp + 10000) / 1000)` seconds.

---

## 4. Target Implementation Architecture

```
[entries array from existing score data]
    ↓
[Canvas 2D: render each keyframe — green bg (#00ff00) + text]
    ↓
[VideoFrame: wrap canvas ImageData as VideoFrame]
    ↓
[VideoEncoder (WebCodecs): encode H.264 frame with correct timestamp/duration]
    ↓
[Mp4Muxer (pure JS): accumulate encoded chunks into MP4 container]
    ↓
[Uint8Array → Blob → Web Share API / blob download]
```

**Output specs:**
- Resolution: 1920×1080
- Frame rate: 30fps (configurable constant)
- Codec: H.264 (`avc1.42E01F` baseline profile)
- Chroma key color: pure green `rgb(0, 255, 0)` — #00ff00
- Score text: white, centered, bottom third of frame
- Set info text: cyan (#00ccff), above score text
- Total frames = `totalDurationSeconds × 30` — but only `entries.length` unique canvas renders needed

---

## 5. MP4 Muxer Library

Use **`mp4-muxer`** by Vanilagy. It is:
- Pure TypeScript/JS, zero native dependencies
- Designed specifically for WebCodecs output
- Available as a single ES module file (~15KB minified)
- License: MIT

**CDN URL (use this exact URL):**
```
https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs
```

Import it as an ES module in a `<script type="module">` tag, OR use the UMD build if module syntax conflicts with the existing Babel setup. Check the jsDelivr CDN for the UMD build path.

**Key API usage:**

```javascript
import { Muxer, ArrayBufferTarget } from 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs';

const target = new ArrayBufferTarget();
const muxer = new Muxer({
  target,
  video: {
    codec: 'avc',
    width: 1920,
    height: 1080,
  },
  fastStart: 'in-memory',
});

// After all chunks encoded:
muxer.finalize();
const { buffer } = target;
// buffer is an ArrayBuffer of the complete MP4
```

**Adding encoded chunks from VideoEncoder:**

```javascript
encoder.onoutput = (chunk, meta) => {
  muxer.addVideoChunk(chunk, meta);
};
```

---

## 6. WebCodecs VideoEncoder Setup

```javascript
const encoder = new VideoEncoder({
  output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
  error: (e) => console.error('Encoder error:', e),
});

encoder.configure({
  codec: 'avc1.42E01F',   // H.264 Baseline Profile Level 3.1
  width: 1920,
  height: 1080,
  bitrate: 8_000_000,     // 8 Mbps — sufficient for text-on-green
  framerate: 30,
  latencyMode: 'quality',
});
```

**Frame submission — keyframe optimization:**

Do NOT loop over every frame individually. Instead, for each `entry`:

1. Render the canvas once for that entry's content
2. Calculate `startFrame = Math.round(entry.start * 30)`
3. Calculate `endFrame = Math.round(entry.end * 30)`
4. Submit one `VideoFrame` per distinct frame, OR use the timestamp/duration fields to represent the range

In practice, WebCodecs requires one `VideoFrame` per video frame for correct output. Use a loop but avoid re-rendering the canvas on each iteration:

```javascript
for (let frameNum = startFrame; frameNum < endFrame; frameNum++) {
  const timestampUs = Math.round((frameNum / 30) * 1_000_000); // microseconds
  const durationUs = Math.round((1 / 30) * 1_000_000);

  // Re-use the same canvas — only re-draw when entry changes (keyframe)
  const videoFrame = new VideoFrame(canvas, {
    timestamp: timestampUs,
    duration: durationUs,
  });

  const isKeyframe = frameNum === startFrame; // keyframe at each score change
  encoder.encode(videoFrame, { keyFrame: isKeyframe });
  videoFrame.close(); // mandatory — prevent memory leak
}
```

**Canvas rendering per keyframe:**

```javascript
function renderFrame(ctx, entry, width, height) {
  // Green background
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(0, 0, width, height);

  if (!entry) return; // blank frame before first score

  // Score text (white, large, centered, bottom third)
  ctx.font = 'bold 72px Arial, Helvetica, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  // Shadow for legibility
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  ctx.fillText(entry.score, width / 2, height - 60);

  // Set info (cyan, smaller, above score)
  ctx.font = 'bold 36px Arial, Helvetica, sans-serif';
  ctx.fillStyle = '#00ccff';
  ctx.fillText(entry.set_info, width / 2, height - 145);

  ctx.shadowColor = 'transparent'; // reset
}
```

---

## 7. Progress UI

The encoding loop is synchronous-ish but VideoEncoder is async internally. Use a progress bar in the UI. Suggested approach:

- Compute `totalFrames = totalDurationSeconds * 30`
- After each entry's frames are enqueued, update a `<progress>` element or a state variable
- Yield to the event loop periodically using `await new Promise(r => setTimeout(r, 0))` every ~300 frames to keep the UI responsive and prevent browser timeout

---

## 8. Download / Share

Reuse the existing `blobDownloadFallback()` and Web Share API logic already in the app:

```javascript
async function generateAndDownloadMP4() {
  // ... encoding loop ...
  await encoder.flush();
  muxer.finalize();
  
  const mp4Buffer = target.buffer;
  const blob = new Blob([mp4Buffer], { type: 'video/mp4' });
  const filename = `scorelayer_${teamA}_vs_${teamB}_overlay.mp4`;

  // Re-use existing share/download logic
  // iOS: navigator.share with File object
  // Desktop: URL.createObjectURL + <a download>
}
```

Note the filename convention: `scorelayer_` prefix (not `volleyball_`) — this aligns with the project's export naming standard.

---

## 9. Browser Compatibility

| Browser | WebCodecs VideoEncoder H.264 | Notes |
|---|---|---|
| Chrome 94+ (desktop) | ✅ Full | Primary target |
| Safari 16.4+ (iOS/Mac) | ✅ Full | Primary target (iPhone/iPad) |
| Firefox 130+ | ⚠️ Partial | VideoEncoder behind flag, not default |
| Chrome Android | ✅ Full | |

**Graceful degradation:** Keep the existing chroma kit `.zip` download as a fallback. Before calling `new VideoEncoder(...)`, check:

```javascript
if (typeof VideoEncoder === 'undefined') {
  // Fall back to zip download
  downloadChromaKit();
  return;
}
```

Or show a UI message: "Your browser does not support WebCodecs. Download the Chroma Kit script instead."

---

## 10. Script Tag Placement Rules (CRITICAL)

The existing `index.html` has a strict two-script structure:

1. `<script>` — pure JS (no JSX, no React). All generators go here.
2. `<script type="text/babel">` — React component JSX only.

**Rules that must not be violated:**
- CSS goes in `<style>` tag only. Never in JS template literals.
- New utility functions (like the MP4 generator) go in script tag #1.
- React state and UI for the progress/generate button go in script tag #2.
- If using ES module `import` for mp4-muxer, it requires a `<script type="module">` tag — add this as a **third** script tag before the other two, and attach the `Muxer`/`ArrayBufferTarget` to `window` so the other scripts can access them: `window.Mp4Muxer = { Muxer, ArrayBufferTarget }`.

**Module script pattern:**
```html
<script type="module">
  import { Muxer, ArrayBufferTarget } from 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs';
  window.Mp4Muxer = { Muxer, ArrayBufferTarget };
</script>
<script>
  // pure JS — can reference window.Mp4Muxer
</script>
<script type="text/babel">
  // React JSX component
</script>
```

---

## 11. UX Changes Required

In the React component (`<script type="text/babel">`):

**Replace** the current "Download Chroma Kit (.zip)" button block with:

```jsx
<button
  className="btn btn-primary"
  style={{ background: '#16a34a', boxShadow: '0 4px 20px rgba(22,163,74,0.3)' }}
  onClick={handleGenerateMP4}
  disabled={!state.syncTimestamp || isEncoding}
>
  {isEncoding ? `Generating… ${encodeProgress}%` : 'Generate Overlay MP4'}
</button>

{isEncoding && (
  <div style={{ width: '100%', background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden', height: 6 }}>
    <div style={{ width: `${encodeProgress}%`, height: '100%', background: '#16a34a', transition: 'width 0.2s' }} />
  </div>
)}

{/* Keep zip fallback for unsupported browsers */}
<button className="btn btn-small" onClick={downloadChromaKit} disabled={!state.syncTimestamp}>
  ↓ Chroma Kit (.zip fallback)
</button>
```

Add state variables:
```javascript
const [isEncoding, setIsEncoding] = useState(false);
const [encodeProgress, setEncodeProgress] = useState(0);
```

---

## 12. What NOT to Change

- Do not remove `generateChromaScript()`, `generateASS()`, `buildZip()`, `downloadChromaKit()` — keep as fallback
- Do not move CSS out of `<style>` tag
- Do not change the export filename prefix from `scorelayer_`
- Do not change the volleyball scoring logic
- Do not add a build step or replace CDN dependencies
- Do not change the GitHub Actions deploy workflow

---

## 13. Acceptance Criteria

1. Tapping "Generate Overlay MP4" on iPhone (iOS 17, Safari) produces a downloadable `.mp4` via the share sheet
2. The MP4 opens in iMovie and the Green/Blue Screen mode removes the background, leaving white score text
3. Score text is readable and correctly positioned (bottom third, centered)
4. Set info appears above the score text in cyan
5. Timestamps align correctly with the sync point (first frame of MP4 corresponds to sync moment)
6. On a browser without WebCodecs, the button either falls back to the zip download or shows a clear message
7. No regressions on existing SRT, FCPXML, CSV, ASS exports
8. No black page (no CSS in JS template literals)

---

## 14. Files to Deliver

A single modified `index.html`. The full file should be production-ready for direct commit to the repo and deployment via GitHub Pages.

If the implementation requires verifying the exact mp4-muxer API surface before coding, check: https://github.com/Vanilagy/mp4-muxer
