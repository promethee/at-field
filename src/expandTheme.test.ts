import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { expandTheme, ensureModelPulled } from "./theme.js";

afterEach(() => mock.restoreAll());

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function tags(...names: string[]): Response {
  return json({ models: names.map((n) => ({ name: n, model: n })) });
}

/** Streamed NDJSON like Ollama's, with the text split across two chunks. */
function generate(payload: unknown): Response {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  const mid = Math.floor(text.length / 2);
  const lines = [
    { response: text.slice(0, mid), done: false },
    { response: text.slice(mid), done: true },
  ]
    .map((l) => JSON.stringify(l))
    .join("\n");
  return new Response(lines + "\n", { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

interface Call {
  url: string;
  body?: Record<string, unknown>;
}

/** Stubs global fetch with a per-URL handler and records every call. */
function stubFetch(handler: (url: string, body?: Record<string, unknown>) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ url, body });
    return handler(url, body);
  });
  return calls;
}

const neverConfirm = async () => {
  throw new Error("confirm must not be called");
};
const neverPull = async () => {
  throw new Error("pullModel must not be called");
};

// --- ensureModelPulled -----------------------------------------------------

test("ensureModelPulled throws a clear error when the Ollama server is unreachable", async () => {
  stubFetch(() => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(
    () => ensureModelPulled("qwen2.5:3b", { confirm: neverConfirm, pullModel: neverPull }),
    /Could not reach a local Ollama server/,
  );
});

test("ensureModelPulled surfaces a non-OK /api/tags response", async () => {
  stubFetch(() => new Response("boom", { status: 500, statusText: "Internal Server Error" }));
  await assert.rejects(
    () => ensureModelPulled("qwen2.5:3b", { confirm: neverConfirm, pullModel: neverPull }),
    /Ollama request failed \(500\)/,
  );
});

test("ensureModelPulled does nothing when the model is already pulled", async () => {
  stubFetch(() => tags("other:1b", "qwen2.5:3b"));
  await ensureModelPulled("qwen2.5:3b", { confirm: neverConfirm, pullModel: neverPull });
});

test("ensureModelPulled treats a bare model name as :latest", async () => {
  stubFetch(() => tags("mistral:latest"));
  await ensureModelPulled("mistral", { confirm: neverConfirm, pullModel: neverPull });
});

test("ensureModelPulled does not treat a different tag as a match", async () => {
  stubFetch(() => tags("qwen2.5:0.5b"));
  const pulled: string[] = [];
  await ensureModelPulled("qwen2.5:3b", {
    confirm: async () => true,
    pullModel: async (m) => void pulled.push(m),
  });
  assert.deepEqual(pulled, ["qwen2.5:3b"]);
});

test("ensureModelPulled pulls the model when it is missing and the user accepts", async () => {
  stubFetch(() => tags());
  const asked: string[] = [];
  const pulled: string[] = [];
  await ensureModelPulled("qwen2.5:3b", {
    confirm: async (message, defaultYes) => {
      asked.push(message);
      assert.equal(defaultYes, true);
      return true;
    },
    pullModel: async (m) => void pulled.push(m),
  });
  assert.equal(asked.length, 1);
  assert.match(asked[0], /qwen2\.5:3b/);
  assert.deepEqual(pulled, ["qwen2.5:3b"]);
});

test("ensureModelPulled aborts without pulling when the user declines", async () => {
  stubFetch(() => tags());
  await assert.rejects(
    () => ensureModelPulled("qwen2.5:3b", { confirm: async () => false, pullModel: neverPull }),
    /Aborted: run `ollama pull qwen2\.5:3b`/,
  );
});

test("ensureModelPulled propagates a failed pull", async () => {
  stubFetch(() => tags());
  await assert.rejects(
    () =>
      ensureModelPulled("qwen2.5:3b", {
        confirm: async () => true,
        pullModel: async () => {
          throw new Error("pull failed");
        },
      }),
    /pull failed/,
  );
});

// --- expandTheme -----------------------------------------------------------

function ollamaOk(terms: unknown) {
  return (url: string) => (url.endsWith("/api/tags") ? tags("qwen2.5:3b") : generate(terms));
}

test("expandTheme returns cleaned single-word terms and flags a thin field", async () => {
  stubFetch(ollamaOk({ terms: ["budget", "budget", "croissance du secteur", "impôt"] }));
  const field = await expandTheme("économie", { language: "fr" });
  assert.equal(field.theme, "économie");
  assert.deepEqual(field.terms, ["budget", "impôt"]);
  assert.equal(field.isThin, true);
});

test("expandTheme drops the theme's own words from the result", async () => {
  stubFetch(ollamaOk({ terms: ["economy", "budget", "tax"] }));
  const field = await expandTheme("economy");
  assert.deepEqual(field.terms, ["budget", "tax"]);
});

test("expandTheme is not thin when 8 or more terms survive", async () => {
  const terms = ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"];
  stubFetch(ollamaOk({ terms }));
  const field = await expandTheme("things");
  assert.equal(field.terms.length, 8);
  assert.equal(field.isThin, false);
});

test("expandTheme request body carries the default model, num_predict cap, and schema", async () => {
  const calls = stubFetch(ollamaOk({ terms: ["a1"] }));
  await expandTheme("economy");
  const gen = calls.find((c) => c.url.endsWith("/api/generate"));
  assert.ok(gen?.body);
  assert.equal(gen.body.model, "qwen2.5:3b");
  assert.equal(gen.body.stream, true);
  assert.equal((gen.body.options as { num_predict: number }).num_predict, 1024);
  assert.equal((gen.body.format as { type: string }).type, "object");
});

test("expandTheme sends a fixed seed and leaves temperature at the model default", async () => {
  const calls = stubFetch(ollamaOk({ terms: ["a1"] }));
  await expandTheme("economy");
  const options = calls.find((c) => c.url.endsWith("/api/generate"))?.body?.options as Record<string, unknown>;
  assert.equal(options.seed, 0);
  assert.equal("temperature" in options, false);
});

test("expandTheme tells the model to answer in the transcript's language", async () => {
  const calls = stubFetch(ollamaOk({ terms: ["a1"] }));
  await expandTheme("économie", { language: "fr" });
  const prompt = String(calls.find((c) => c.url.endsWith("/api/generate"))?.body?.prompt);
  assert.match(prompt, /Write every term in French/);
  assert.match(prompt, /économie/);
});

test("expandTheme falls back to the theme's language when none is given", async () => {
  const calls = stubFetch(ollamaOk({ terms: ["a1"] }));
  await expandTheme("economy");
  const prompt = String(calls.find((c) => c.url.endsWith("/api/generate"))?.body?.prompt);
  assert.match(prompt, /same language as the theme/);
});

test("expandTheme asks for single, plain, everyday words", async () => {
  const calls = stubFetch(ollamaOk({ terms: ["a1"] }));
  await expandTheme("economy");
  const prompt = String(calls.find((c) => c.url.endsWith("/api/generate"))?.body?.prompt);
  assert.match(prompt, /plain, everyday words/);
  assert.match(prompt, /Avoid rare, technical or literary words/);
  assert.match(prompt, /exactly one word/);
  assert.match(prompt, /Do not repeat the theme's own words/);
});

function generateBody(calls: Call[]) {
  return calls.find((c) => c.url.endsWith("/api/generate"))?.body as {
    prompt: string;
    format: { properties: { terms: { maxItems: number } } };
  };
}

test("expandTheme asks for 1.5x the default field size and keeps at most the default size", async () => {
  const many = Array.from({ length: 40 }, (_, i) => `t${i}`);
  const calls = stubFetch(ollamaOk({ terms: many }));
  const field = await expandTheme("economy");
  const body = generateBody(calls);
  assert.match(body.prompt, /Give 38 words\./);
  assert.equal(body.format.properties.terms.maxItems, 38);
  assert.equal(field.terms.length, 25);
  assert.deepEqual(field.terms.slice(0, 3), ["t0", "t1", "t2"]);
});

test("expandTheme honours a custom field size", async () => {
  const many = Array.from({ length: 40 }, (_, i) => `t${i}`);
  const calls = stubFetch(ollamaOk({ terms: many }));
  const field = await expandTheme("economy", { size: 10 });
  const body = generateBody(calls);
  assert.match(body.prompt, /Give 15 words\./);
  assert.equal(body.format.properties.terms.maxItems, 15);
  assert.equal(field.terms.length, 10);
});

test("expandTheme returns fewer words than the size when the model has fewer to give", async () => {
  stubFetch(ollamaOk({ terms: ["budget", "tax", "wage"] }));
  const field = await expandTheme("economy", { size: 20 });
  assert.equal(field.terms.length, 3);
  assert.equal(field.isThin, true);
});

test("expandTheme reports incomplete output when the response isn't valid JSON", async () => {
  stubFetch(ollamaOk('{"terms": ["budget", "tax'));
  await assert.rejects(() => expandTheme("economy"), /incomplete output/);
});

test("expandTheme explains a 404 from /api/generate as a missing model", async () => {
  stubFetch((url) => (url.endsWith("/api/tags") ? tags("qwen2.5:3b") : new Response("", { status: 404 })));
  await assert.rejects(() => expandTheme("economy"), /isn't pulled yet/);
});

test("expandTheme surfaces other /api/generate failures with the status", async () => {
  stubFetch((url) =>
    url.endsWith("/api/tags") ? tags("qwen2.5:3b") : new Response("model crashed", { status: 500 }),
  );
  await assert.rejects(() => expandTheme("economy"), /Ollama request failed \(500\): model crashed/);
});

test("expandTheme reports an unreachable server if it drops between the two requests", async () => {
  stubFetch((url) => {
    if (url.endsWith("/api/tags")) return tags("qwen2.5:3b");
    throw new TypeError("fetch failed");
  });
  await assert.rejects(() => expandTheme("economy"), /Could not reach a local Ollama server/);
});

test("expandTheme surfaces an error line sent inside the stream", async () => {
  stubFetch((url) =>
    url.endsWith("/api/tags")
      ? tags("qwen2.5:3b")
      : new Response(JSON.stringify({ error: "model runner crashed" }) + "\n", { status: 200 }),
  );
  await assert.rejects(() => expandTheme("economy"), /Ollama request failed: model runner crashed/);
});

test("expandTheme reports a stream that dies mid-generation", async () => {
  stubFetch((url) => {
    if (url.endsWith("/api/tags")) return tags("qwen2.5:3b");
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ response: '{"terms": ["a1"' }) + "\n"));
        controller.error(new TypeError("terminated"));
      },
    });
    return new Response(body, { status: 200 });
  });
  await assert.rejects(() => expandTheme("economy"), /stopped responding mid-generation/);
});

test("expandTheme joins streamed chunks into one JSON document", async () => {
  stubFetch(ollamaOk({ terms: ["budget", "impôt", "salaire"] }));
  const field = await expandTheme("économie", { language: "fr" });
  assert.deepEqual(field.terms, ["budget", "impôt", "salaire"]);
});
