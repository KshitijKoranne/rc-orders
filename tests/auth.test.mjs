import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionValue,
  IDLE_SESSION_MS,
  isWithinIdleWindow,
  passwordMatches,
  refreshSessionValue,
} from "../lib/auth.ts";

test("password sessions use a five-minute sliding idle window", async () => {
  const previousPassword = process.env.RITHYA_ACCESS_PASSWORD;
  process.env.RITHYA_ACCESS_PASSWORD = "test-only-password";
  const startedAt = 1_700_000_000_000;

  try {
    assert.equal(await passwordMatches("test-only-password"), true);
    assert.equal(await passwordMatches("wrong-password"), false);
    assert.equal(isWithinIdleWindow(startedAt, startedAt + IDLE_SESSION_MS), true);
    assert.equal(isWithinIdleWindow(startedAt, startedAt + IDLE_SESSION_MS + 1), false);

    const session = await createSessionValue(startedAt);
    assert.ok(session);
    assert.ok(await refreshSessionValue(session, startedAt + 1_000));
    assert.equal(await refreshSessionValue(session, startedAt + IDLE_SESSION_MS + 1), null);
  } finally {
    if (previousPassword === undefined) delete process.env.RITHYA_ACCESS_PASSWORD;
    else process.env.RITHYA_ACCESS_PASSWORD = previousPassword;
  }
});
