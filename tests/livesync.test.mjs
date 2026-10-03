// Live Share reliability (issue #63): every Firebase call the user waits on
// must time out, and a timed-out or abandoned sign-in must never stay cached.
// Run with: `node --test tests/`
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { helpers } from "./harness.mjs";

const realFirebase = helpers.firebase;
const realSigninTimeout = helpers.FIREBASE_SIGNIN_TIMEOUT_MS;

// Minimal compat-SDK stub. `signIn` returns the promise signInAnonymously()
// should return for the current call.
function stubFirebase(signIn) {
  const auth = {
    currentUser: null,
    calls: 0,
    signInAnonymously() {
      auth.calls++;
      return signIn(auth.calls);
    },
  };
  return {
    apps: [{}],
    initializeApp() {},
    auth: () => auth,
    database: () => ({ ref: () => ({ on() {} }), goOffline() {}, goOnline() {} }),
    _auth: auth,
  };
}

const never = () => new Promise(() => {});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  helpers.FIREBASE_READY = false;
  helpers.firebaseAuthPromise = null;
  helpers.firebaseLastError = null;
  helpers.firebaseConnected = null;
  helpers.FIREBASE_SIGNIN_TIMEOUT_MS = 20;
});

afterEach(() => {
  helpers.firebase = realFirebase;
  helpers.FIREBASE_SIGNIN_TIMEOUT_MS = realSigninTimeout;
});

// ---------- withTimeout ----------

test("withTimeout: passes through a value that arrives in time", async () => {
  assert.equal(await helpers.withTimeout(Promise.resolve(42), 50, "timeout/x"), 42);
});

test("withTimeout: passes through a rejection that arrives in time", async () => {
  const err = new Error("boom");
  await assert.rejects(helpers.withTimeout(Promise.reject(err), 50, "timeout/x"), (e) => e === err);
});

test("withTimeout: rejects a promise that never settles with the given code", async () => {
  await assert.rejects(helpers.withTimeout(never(), 10, "timeout/write"), (e) => {
    assert.equal(e.code, "timeout/write");
    assert.equal(e.timeout, true);
    return true;
  });
});

// ---------- initFirebase ----------

test("initFirebase: a hanging sign-in times out to null with a timeout error", async () => {
  helpers.firebase = stubFirebase(never);
  const uid = await helpers.initFirebase();
  assert.equal(uid, null);
  assert.equal(helpers.firebaseLastError.code, "timeout/sign-in");
  assert.equal(helpers.FIREBASE_READY, false);
  assert.equal(helpers.firebaseAuthPromise, null, "a timed-out promise must not stay cached");
});

test("initFirebase: retry after a timeout starts a fresh sign-in instead of awaiting the stuck one", async () => {
  const fb = stubFirebase((n) => (n === 1 ? never() : Promise.resolve({ user: { uid: "u1" } })));
  helpers.firebase = fb;
  assert.equal(await helpers.initFirebase(), null);
  assert.equal(await helpers.initFirebase(), "u1");
  assert.equal(fb._auth.calls, 2);
  assert.equal(helpers.FIREBASE_READY, true);
  assert.equal(helpers.firebaseLastError, null);
});

test("initFirebase: a sign-in that succeeded late is reused without signing in again", async () => {
  const fb = stubFirebase(never);
  helpers.firebase = fb;
  assert.equal(await helpers.initFirebase(), null);
  fb._auth.currentUser = { uid: "late" };
  assert.equal(await helpers.initFirebase(), "late");
  assert.equal(fb._auth.calls, 1);
  assert.equal(helpers.FIREBASE_READY, true);
});

test("initFirebase: a successful sign-in is cached", async () => {
  const fb = stubFirebase(() => Promise.resolve({ user: { uid: "u1" } }));
  helpers.firebase = fb;
  assert.equal(await helpers.initFirebase(), "u1");
  assert.equal(await helpers.initFirebase(), "u1");
  assert.equal(fb._auth.calls, 1);
});

test("abandonFirebaseSignIn: drops a pending sign-in; the old attempt failing later doesn't clear the new one", async () => {
  helpers.FIREBASE_SIGNIN_TIMEOUT_MS = 10000;
  const first = deferred();
  const second = deferred();
  const fb = stubFirebase((n) => (n === 1 ? first.promise : second.promise));
  helpers.firebase = fb;
  const p1 = helpers.initFirebase();
  helpers.abandonFirebaseSignIn();
  const p2 = helpers.initFirebase();
  assert.notEqual(p1, p2);
  assert.equal(fb._auth.calls, 2);
  first.reject(new Error("stale"));
  await p1;
  assert.equal(helpers.firebaseAuthPromise, p2, "stale failure must not clear the newer attempt");
  second.resolve({ user: { uid: "u2" } });
  assert.equal(await p2, "u2");
});

test("abandonFirebaseSignIn: keeps a sign-in that already succeeded", async () => {
  helpers.firebase = stubFirebase(() => Promise.resolve({ user: { uid: "u1" } }));
  const p = helpers.initFirebase();
  await p;
  helpers.abandonFirebaseSignIn();
  assert.equal(helpers.firebaseAuthPromise, p);
});

// ---------- describeFirebaseError ----------

test("describeFirebaseError: timeouts produce retryable, scoring-is-safe messages", () => {
  const signIn = helpers.describeFirebaseError({ code: "timeout/sign-in" });
  assert.match(signIn, /retry/i);
  assert.match(signIn, /Scoring is not affected/);
  helpers.firebaseConnected = false;
  assert.match(helpers.describeFirebaseError({ code: "timeout/write" }), /Not connected/);
  helpers.firebaseConnected = true;
  assert.match(helpers.describeFirebaseError({ code: "timeout/write" }), /did not confirm/);
});
