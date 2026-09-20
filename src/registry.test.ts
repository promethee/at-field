import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { parseModelRef, lookupModel, fetchModelSize, formatSize } from "./registry.js";

afterEach(() => mock.restoreAll());

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): string[] {
  const urls: string[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    urls.push(String(input));
    return handler(String(input), init);
  });
  return urls;
}

const manifest = { config: { size: 500 }, layers: [{ size: 1_000_000_000 }, { size: 929_999_500 }] };

test("parseModelRef puts a bare name in the library namespace", () => {
  assert.deepEqual(parseModelRef("qwen2.5:3b"), { path: "library/qwen2.5", tag: "3b" });
});

test("parseModelRef defaults the tag to latest", () => {
  assert.deepEqual(parseModelRef("mistral"), { path: "library/mistral", tag: "latest" });
});

test("parseModelRef keeps a user namespace", () => {
  assert.deepEqual(parseModelRef("someone/custom:7b"), { path: "someone/custom", tag: "7b" });
});

test("parseModelRef returns null for names it cannot look up", () => {
  for (const bad of ["hf.co/user/name:q4", "", "a//b", ":3b", "name:"]) {
    assert.equal(parseModelRef(bad), null, bad);
  }
});

test("lookupModel sums the config and layer sizes and asks the manifest endpoint", async () => {
  const urls = stubFetch(() => new Response(JSON.stringify(manifest), { status: 200 }));
  const result = await lookupModel("qwen2.5:3b");
  assert.deepEqual(result, { ok: true, bytes: 1_930_000_000 });
  assert.equal(urls[0], "https://registry.ollama.ai/v2/library/qwen2.5/manifests/3b");
});

test("lookupModel reports a missing tag", async () => {
  stubFetch(() => new Response("", { status: 404 }));
  const result = await lookupModel("qwen2.5:nope");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /404/);
});

test("lookupModel reports other registry statuses", async () => {
  stubFetch(() => new Response("", { status: 503 }));
  const result = await lookupModel("qwen2.5:3b");
  assert.match(result.ok ? "" : result.reason, /503/);
});

test("lookupModel reports an unreachable registry", async () => {
  stubFetch(() => {
    throw new TypeError("fetch failed");
  });
  const result = await lookupModel("qwen2.5:3b");
  assert.match(result.ok ? "" : result.reason, /unreachable/);
});

test("lookupModel reports a manifest that is not JSON or lists no sizes", async () => {
  stubFetch(() => new Response("<html>", { status: 200 }));
  const notJson = await lookupModel("a:1");
  assert.match(notJson.ok ? "" : notJson.reason, /not valid JSON/);
  mock.restoreAll();
  stubFetch(() => new Response(JSON.stringify({ layers: [] }), { status: 200 }));
  const empty = await lookupModel("a:1");
  assert.match(empty.ok ? "" : empty.reason, /no sizes/);
});

test("lookupModel refuses names that carry a host", async () => {
  const urls = stubFetch(() => new Response("{}", { status: 200 }));
  const result = await lookupModel("hf.co/user/name:q4");
  assert.equal(result.ok, false);
  assert.equal(urls.length, 0);
});

test("fetchModelSize returns bytes on success and null on failure", async () => {
  stubFetch(() => new Response(JSON.stringify(manifest), { status: 200 }));
  assert.equal(await fetchModelSize("qwen2.5:3b"), 1_930_000_000);
  mock.restoreAll();
  stubFetch(() => new Response("", { status: 404 }));
  assert.equal(await fetchModelSize("qwen2.5:3b"), null);
});

test("formatSize shows gigabytes and megabytes", () => {
  assert.equal(formatSize(1_930_000_000), "about 1.9 GB");
  assert.equal(formatSize(397_000_000), "about 397 MB");
});
