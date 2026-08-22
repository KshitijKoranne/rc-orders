import assert from "node:assert/strict";
import test from "node:test";

test("renders an empty Rithya Creations state without seeded data", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Rithya Creations<\/title>/i);
  assert.match(html, /Rithya Creations/i);
  assert.match(html, /Dashboard/i);
  assert.match(html, /Sales and orders/i);
  assert.match(html, /New R-code/i);
  assert.match(html, /New order/i);
  assert.match(html, /Catalogue/i);
  assert.match(html, /Orders/i);
  assert.match(html, /No orders have been saved yet/i);
  assert.doesNotMatch(html, /Save each candle|Keep images below|Auto-filled from R-code/);
  assert.doesNotMatch(html, /Aarti Sharma|Neha Patel|Lavender jar candle|Mogra floating candle set/);
});
