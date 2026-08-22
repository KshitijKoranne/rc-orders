import assert from "node:assert/strict";
import test from "node:test";
import { createSessionValue, IDLE_SESSION_MS } from "../lib/auth.ts";

test("Sites Worker protects sign-in, API access, and expired sessions", async () => {
  const previousPassword = process.env.RITHYA_ACCESS_PASSWORD;
  process.env.RITHYA_ACCESS_PASSWORD = "test-only-password";

  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("auth-test", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const env = {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    };
    const context = {
      waitUntil() {},
      passThroughOnException() {},
    };
    const request = (path, init) => worker.fetch(new Request(`http://localhost${path}`, init), env, context);

    const unauthenticatedApi = await request("/api/records");
    assert.equal(unauthenticatedApi.status, 401);

    const wrongPassword = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" }),
    });
    assert.equal(wrongPassword.status, 401);

    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "test-only-password" }),
    });
    assert.equal(login.status, 200);
    const sessionCookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    assert.match(sessionCookie ?? "", /^rithya_session=\S+$/);
    assert.match(login.headers.get("set-cookie") ?? "", /HttpOnly/);
    assert.match(login.headers.get("set-cookie") ?? "", /SameSite=Strict/);

    const authenticatedApi = await request("/api/records", {
      method: "PUT",
      headers: {
        cookie: sessionCookie,
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(authenticatedApi.status, 400);

    const expiredSession = await createSessionValue(Date.now() - IDLE_SESSION_MS - 1);
    const expired = await request("/api/auth/heartbeat", {
      method: "POST",
      headers: { cookie: `rithya_session=${expiredSession}` },
    });
    assert.equal(expired.status, 401);
  } finally {
    if (previousPassword === undefined) delete process.env.RITHYA_ACCESS_PASSWORD;
    else process.env.RITHYA_ACCESS_PASSWORD = previousPassword;
  }
});
