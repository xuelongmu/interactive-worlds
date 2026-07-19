import assert from "node:assert/strict";
import test from "node:test";

import { createSessionChallengeFetch } from "./session-challenge.ts";

const ORIGIN = "https://play.example.test";
const CHALLENGE_HEADERS = {
  "x-session-challenge": "turnstile",
  "content-type": "application/json",
};

function required() {
  return Response.json(
    { error: "challenge required", code: "challenge_required" },
    { status: 428, headers: CHALLENGE_HEADERS }
  );
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function bodyOf(init) {
  return init?.body ? JSON.parse(String(init.body)) : null;
}

test("passes unrelated requests and non-challenge responses through unchanged", async () => {
  const calls = [];
  let challenges = 0;
  const nativeFetch = async (input, init) => {
    calls.push({ input, init });
    if (String(input).includes("/api/session")) {
      return Response.json({ jwt: "already-cleared" });
    }
    return new Response(null, { status: 204 });
  };
  const wrapped = createSessionChallengeFetch(
    nativeFetch,
    async () => {
      challenges += 1;
      return "unused";
    },
    ORIGIN
  );

  const asset = await wrapped("/asset.bin");
  const session = await wrapped("/api/session", { method: "POST" });

  assert.equal(asset.status, 204);
  assert.deepEqual(await session.json(), { jwt: "already-cleared" });
  assert.equal(challenges, 0);
  assert.equal(calls.length, 2);
});

test("first request waits for an explicit challenge response before rendering once", async () => {
  const calls = [];
  let challenges = 0;
  let cleared = false;
  const nativeFetch = async (input, init) => {
    const body = await bodyOf(init);
    calls.push({ input: String(input), body, credentials: init?.credentials });
    if (body?.challengeToken) {
      cleared = true;
      return Response.json({ jwt: "exchange-jwt" });
    }
    return cleared ? Response.json({ jwt: "later-jwt" }) : required();
  };
  const wrapped = createSessionChallengeFetch(
    nativeFetch,
    async () => {
      challenges += 1;
      return "single-use-token";
    },
    ORIGIN
  );

  const first = await wrapped("/api/session", { method: "POST" });
  const second = await wrapped("/api/session", { method: "POST" });

  assert.deepEqual(await first.json(), { jwt: "exchange-jwt" });
  assert.deepEqual(await second.json(), { jwt: "later-jwt" });
  assert.equal(challenges, 1);
  assert.deepEqual(
    calls.map((call) => call.body),
    [null, { challengeToken: "single-use-token" }, null]
  );
  assert.equal(calls[1].credentials, "same-origin");
});

test("concurrent requests share one widget and exchange while each gets a JWT", async () => {
  const tokenGate = deferred();
  let challenges = 0;
  let cleared = false;
  let exchangeCalls = 0;
  let normalCalls = 0;
  const nativeFetch = async (_input, init) => {
    const body = await bodyOf(init);
    if (body?.challengeToken) {
      exchangeCalls += 1;
      assert.equal(body.challengeToken, "single-use-token");
      cleared = true;
      return Response.json({ jwt: "exchange-jwt" });
    }
    normalCalls += 1;
    return cleared ? Response.json({ jwt: "waiter-jwt" }) : required();
  };
  const wrapped = createSessionChallengeFetch(
    nativeFetch,
    async () => {
      challenges += 1;
      return tokenGate.promise;
    },
    ORIGIN
  );

  const firstPromise = wrapped("/api/session", { method: "POST" });
  const secondPromise = wrapped("/api/session", { method: "POST" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(challenges, 1);
  tokenGate.resolve("single-use-token");

  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  const bodies = await Promise.all([first.json(), second.json()]);

  assert.deepEqual(bodies, [{ jwt: "exchange-jwt" }, { jwt: "waiter-jwt" }]);
  assert.equal(challenges, 1);
  assert.equal(exchangeCalls, 1);
  assert.equal(normalCalls, 3);
});

test("a late concurrent 428 retries with the newly stored clearance instead of opening a widget", async () => {
  const lateInitial = deferred();
  const tokenGate = deferred();
  let initialCalls = 0;
  let challenges = 0;
  let cleared = false;
  const nativeFetch = async (_input, init) => {
    const body = await bodyOf(init);
    if (body?.challengeToken) {
      cleared = true;
      return Response.json({ jwt: "exchange-jwt" });
    }
    initialCalls += 1;
    if (initialCalls === 1) return required();
    if (initialCalls === 2) return lateInitial.promise;
    assert.equal(cleared, true);
    return Response.json({ jwt: "retry-jwt" });
  };
  const wrapped = createSessionChallengeFetch(
    nativeFetch,
    async () => {
      challenges += 1;
      return tokenGate.promise;
    },
    ORIGIN
  );

  const firstPromise = wrapped("/api/session", { method: "POST" });
  const latePromise = wrapped("/api/session", { method: "POST" });
  await new Promise((resolve) => setImmediate(resolve));
  tokenGate.resolve("single-use-token");
  const first = await firstPromise;
  lateInitial.resolve(required());
  const late = await latePromise;

  assert.deepEqual(await first.json(), { jwt: "exchange-jwt" });
  assert.deepEqual(await late.json(), { jwt: "retry-jwt" });
  assert.equal(challenges, 1);
  assert.equal(initialCalls, 3);
});

test("concurrent callers share a failed exchange response without replaying its token", async () => {
  const tokenGate = deferred();
  let challenges = 0;
  let exchanges = 0;
  const nativeFetch = async (_input, init) => {
    const body = await bodyOf(init);
    if (body?.challengeToken) {
      exchanges += 1;
      return Response.json({ error: "challenge rejected" }, { status: 403 });
    }
    return required();
  };
  const wrapped = createSessionChallengeFetch(
    nativeFetch,
    async () => {
      challenges += 1;
      return tokenGate.promise;
    },
    ORIGIN
  );

  const firstPromise = wrapped("/api/session", { method: "POST" });
  const secondPromise = wrapped("/api/session", { method: "POST" });
  await new Promise((resolve) => setImmediate(resolve));
  tokenGate.resolve("single-use-token");
  const [first, second] = await Promise.all([firstPromise, secondPromise]);

  assert.equal(first.status, 403);
  assert.equal(second.status, 403);
  assert.equal(challenges, 1);
  assert.equal(exchanges, 1);
});

test("widget failures clear singleflight state so a later request can retry fresh", async () => {
  let challengeCalls = 0;
  let exchangeCalls = 0;
  const nativeFetch = async (_input, init) => {
    const body = await bodyOf(init);
    if (body?.challengeToken) {
      exchangeCalls += 1;
      return Response.json({ jwt: "retry-jwt" });
    }
    return required();
  };
  const wrapped = createSessionChallengeFetch(
    nativeFetch,
    async () => {
      challengeCalls += 1;
      if (challengeCalls === 1) throw new Error("widget failed");
      return "fresh-token";
    },
    ORIGIN
  );

  await assert.rejects(
    wrapped("/api/session", { method: "POST" }),
    /widget failed/
  );
  const retry = await wrapped("/api/session", { method: "POST" });

  assert.deepEqual(await retry.json(), { jwt: "retry-jwt" });
  assert.equal(challengeCalls, 2);
  assert.equal(exchangeCalls, 1);
});

test("an unrelated 428 cannot trigger Turnstile", async () => {
  let challenges = 0;
  const wrapped = createSessionChallengeFetch(
    async () => Response.json({ error: "other precondition" }, { status: 428 }),
    async () => {
      challenges += 1;
      return "unused";
    },
    ORIGIN
  );

  const response = await wrapped("/api/session", { method: "POST" });

  assert.equal(response.status, 428);
  assert.equal(challenges, 0);
});
