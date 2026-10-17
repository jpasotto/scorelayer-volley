// Spectator Screen Wake Lock: acquired on start, re-acquired when the tab
// becomes visible again, released on stop, and inert where unsupported.
// Run with: `node --test tests/`
import { test } from "node:test";
import assert from "node:assert/strict";
import { helpers } from "./harness.mjs";

function fakeEnv({ visibility = "visible", reject = false } = {}) {
  const listeners = [];
  const doc = {
    visibilityState: visibility,
    addEventListener: (t, f) => listeners.push([t, f]),
    removeEventListener: (t, f) => {
      const i = listeners.findIndex((l) => l[1] === f);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  const env = { requests: 0, sentinels: [], listeners, doc };
  env.nav = {
    wakeLock: {
      request: async () => {
        env.requests++;
        if (reject) throw new Error("NotAllowedError");
        const rel = [];
        const s = {
          released: false,
          addEventListener: (_, f) => rel.push(f),
          release: async () => { s.released = true; rel.forEach((f) => f()); },
        };
        env.sentinels.push(s);
        return s;
      },
    },
  };
  env.fire = (state) => {
    doc.visibilityState = state;
    listeners.filter((l) => l[0] === "visibilitychange").forEach((l) => l[1]());
  };
  return env;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test("start acquires the lock and reports held", async () => {
  const env = fakeEnv();
  const seen = [];
  const lock = helpers.createWakeLock(env.nav, env.doc, { onChange: (h) => seen.push(h) });
  lock.start();
  await tick();
  assert.equal(lock.isHeld(), true);
  assert.deepEqual(seen, [true]);
});

test("lock is re-acquired after the tab returns to visible", async () => {
  const env = fakeEnv();
  const lock = helpers.createWakeLock(env.nav, env.doc);
  lock.start();
  await tick();
  // Browser releases the lock when the tab is hidden.
  env.fire("hidden");
  await env.sentinels[0].release();
  assert.equal(lock.isHeld(), false);
  env.fire("visible");
  await tick();
  assert.equal(lock.isHeld(), true);
  assert.equal(env.requests, 2);
});

test("stop releases the lock and removes the listener", async () => {
  const env = fakeEnv();
  const lock = helpers.createWakeLock(env.nav, env.doc);
  lock.start();
  await tick();
  lock.stop();
  assert.equal(env.sentinels[0].released, true);
  assert.equal(lock.isHeld(), false);
  assert.equal(env.listeners.length, 0);
});

test("stop during a pending request releases the late sentinel", async () => {
  const env = fakeEnv();
  const lock = helpers.createWakeLock(env.nav, env.doc);
  lock.start();
  lock.stop();
  await tick();
  assert.equal(env.sentinels[0].released, true);
  assert.equal(lock.isHeld(), false);
});

test("no request while hidden; unsupported and denied are harmless", async () => {
  const hidden = fakeEnv({ visibility: "hidden" });
  helpers.createWakeLock(hidden.nav, hidden.doc).start();
  await tick();
  assert.equal(hidden.requests, 0);

  const bare = helpers.createWakeLock({}, fakeEnv().doc);
  assert.equal(bare.supported, false);
  bare.start();
  bare.stop();

  const denied = fakeEnv({ reject: true });
  const lock = helpers.createWakeLock(denied.nav, denied.doc);
  lock.start();
  await tick();
  assert.equal(lock.isHeld(), false);
});
