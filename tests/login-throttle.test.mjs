import assert from "node:assert/strict";
import test from "node:test";
import {
  clearLoginFailures,
  clientKey,
  LOGIN_BLOCK_MS,
  loginBlockedSeconds,
  MAX_FAILED_LOGINS,
  recordLoginFailure,
  resetLoginThrottleForTests,
} from "../lib/login-throttle.ts";

const t0 = 1_700_000_000_000;

test("login locks the client after five failures and unlocks after 15 minutes", () => {
  resetLoginThrottleForTests();
  for (let i = 0; i < MAX_FAILED_LOGINS - 1; i += 1) {
    recordLoginFailure("1.1.1.1", t0 + i);
    assert.equal(loginBlockedSeconds("1.1.1.1", t0 + i), 0);
  }
  recordLoginFailure("1.1.1.1", t0 + 10);
  assert.equal(loginBlockedSeconds("1.1.1.1", t0 + 11), Math.ceil((LOGIN_BLOCK_MS - 1) / 1000));
  assert.ok(loginBlockedSeconds("1.1.1.1", t0 + LOGIN_BLOCK_MS + 9) > 0);
  assert.equal(loginBlockedSeconds("1.1.1.1", t0 + LOGIN_BLOCK_MS + 10), 0);
  // After the block, the client gets a fresh set of five.
  recordLoginFailure("1.1.1.1", t0 + LOGIN_BLOCK_MS + 20);
  assert.equal(loginBlockedSeconds("1.1.1.1", t0 + LOGIN_BLOCK_MS + 21), 0);
});

test("a success clears the failure count", () => {
  resetLoginThrottleForTests();
  for (let i = 0; i < MAX_FAILED_LOGINS - 1; i += 1) recordLoginFailure("2.2.2.2", t0);
  clearLoginFailures("2.2.2.2");
  recordLoginFailure("2.2.2.2", t0 + 1);
  assert.equal(loginBlockedSeconds("2.2.2.2", t0 + 2), 0);
});

test("old failures expire and never add up across long gaps", () => {
  resetLoginThrottleForTests();
  for (let i = 0; i < MAX_FAILED_LOGINS - 1; i += 1) recordLoginFailure("3.3.3.3", t0);
  recordLoginFailure("3.3.3.3", t0 + LOGIN_BLOCK_MS + 1);
  assert.equal(loginBlockedSeconds("3.3.3.3", t0 + LOGIN_BLOCK_MS + 2), 0);
});

test("clients are throttled independently", () => {
  resetLoginThrottleForTests();
  for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) recordLoginFailure("4.4.4.4", t0);
  assert.ok(loginBlockedSeconds("4.4.4.4", t0 + 1) > 0);
  assert.equal(loginBlockedSeconds("5.5.5.5", t0 + 1), 0);
});

test("client key prefers cf-connecting-ip, then first x-forwarded-for, then unknown", () => {
  assert.equal(clientKey(new Headers({ "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "8.8.8.8" })), "9.9.9.9");
  assert.equal(clientKey(new Headers({ "x-forwarded-for": "8.8.8.8, 10.0.0.1" })), "8.8.8.8");
  assert.equal(clientKey(new Headers()), "unknown");
});
