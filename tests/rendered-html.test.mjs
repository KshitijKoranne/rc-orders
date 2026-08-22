import assert from "node:assert/strict";
import test from "node:test";

test("requires the access password before rendering the workbench", async () => {
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

  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location") ?? "", "http://localhost/").pathname, "/login");

  const loginResponse = await worker.fetch(
    new Request("http://localhost/login", {
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

  assert.equal(loginResponse.status, 200);
  assert.match(loginResponse.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await loginResponse.text();
  assert.match(html, /<title>Rithya Creations<\/title>/i);
  assert.match(html, /Rithya Creations/i);
  assert.match(html, /Enter the access password/i);
  assert.match(html, /Open workspace/i);
  assert.doesNotMatch(html, /Dashboard|No orders have been saved yet/i);
});
