// In-memory sign-in throttle, per client IP. One Node process, so a Map is enough.
// A restart clears it, which is acceptable: it only ever makes the app easier to get back into.
export const MAX_FAILED_LOGINS = 5;
export const LOGIN_BLOCK_MS = 15 * 60 * 1000;

type Entry = { failures: number; lastFailureAt: number; blockedUntil: number };

const entries = new Map<string, Entry>();

export function clientKey(headers: Headers) {
  const ip =
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip || "unknown";
}

// Seconds left on the block for this client, or 0 when sign-in is allowed.
export function loginBlockedSeconds(key: string, now = Date.now()) {
  const entry = entries.get(key);
  if (!entry) return 0;
  if (entry.blockedUntil > now) return Math.ceil((entry.blockedUntil - now) / 1000);
  // Not blocked: forget a stale entry so old misses never add up across days.
  if (now - entry.lastFailureAt >= LOGIN_BLOCK_MS) entries.delete(key);
  return 0;
}

export function recordLoginFailure(key: string, now = Date.now()) {
  if (entries.size > 1000) {
    for (const [k, e] of entries) {
      if (e.blockedUntil <= now && now - e.lastFailureAt >= LOGIN_BLOCK_MS) entries.delete(k);
    }
  }
  const previous = entries.get(key);
  const fresh = !previous || now - previous.lastFailureAt >= LOGIN_BLOCK_MS;
  const failures = (fresh ? 0 : previous.failures) + 1;
  entries.set(key, {
    failures,
    lastFailureAt: now,
    blockedUntil: failures >= MAX_FAILED_LOGINS ? now + LOGIN_BLOCK_MS : 0,
  });
}

export function clearLoginFailures(key: string) {
  entries.delete(key);
}

export function resetLoginThrottleForTests() {
  entries.clear();
}
