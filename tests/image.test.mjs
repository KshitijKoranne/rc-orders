import assert from "node:assert/strict";
import test from "node:test";
import {
  originalProductImageUrl,
  productImageUrl,
} from "../lib/image.ts";
import { withSessionCookie } from "../lib/auth.ts";

test("product thumbnail URLs are versioned and viewer URLs remove only the thumbnail variant", () => {
  const thumbnail = productImageUrl("product/1", "abc123");
  assert.equal(
    thumbnail,
    "/api/products/product%2F1/image?variant=thumbnail&v=abc123",
  );
  assert.equal(
    originalProductImageUrl(thumbnail),
    "/api/products/product%2F1/image?v=abc123",
  );
  assert.equal(
    originalProductImageUrl("data:image/png;base64,AAAA"),
    "data:image/png;base64,AAAA",
  );
});

test("authenticated image responses keep an explicit private cache policy", () => {
  const cached = withSessionCookie(
    new Response(null, { headers: { "Cache-Control": "private, max-age=60" } }),
    "session-value",
    new Request("https://example.test/image"),
  );
  assert.equal(cached.headers.get("Cache-Control"), "private, max-age=60");

  const uncached = withSessionCookie(new Response(null), "session-value");
  assert.equal(uncached.headers.get("Cache-Control"), "no-store");
});
