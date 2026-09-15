import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, renderTerminalGraphic } from "./report.js";
import type { AnalysisResult } from "./types.js";

function baseResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    transcript: { text: "paw leash", source: "model", language: "en", segments: [] },
    field: { theme: "dogs", terms: ["paw", "leash", "breed"], isThin: false },
    obviousnessScore: 0.2,
    matches: [
      { term: "paw", count: 3 },
      { term: "leash", count: 1 },
    ],
    segmentHits: [{ start: 2, end: 5, terms: ["paw"] }],
    ...overrides,
  };
}

test("renderMarkdown includes the theme in the title", () => {
  const md = renderMarkdown(baseResult());
  assert.match(md, /# Thematic Analysis: "dogs"/);
});

test("renderMarkdown shows the obviousness score as a percentage", () => {
  const md = renderMarkdown(baseResult({ obviousnessScore: 0.42 }));
  assert.match(md, /\*\*42%\*\*/);
});

test("renderMarkdown includes a thin-field disclaimer only when isThin is true", () => {
  const thin = renderMarkdown(baseResult({ field: { theme: "dogs", terms: ["paw"], isThin: true } }));
  assert.match(thin, /Thin field/);

  const notThin = renderMarkdown(baseResult());
  assert.doesNotMatch(notThin, /Thin field/);
});

test("renderMarkdown lists matches in a table", () => {
  const md = renderMarkdown(baseResult());
  assert.match(md, /\| paw \| 3 \|/);
  assert.match(md, /\| leash \| 1 \|/);
});

test("renderMarkdown formats timestamped occurrences", () => {
  const md = renderMarkdown(baseResult());
  assert.match(md, /\[00:02–00:05\]: paw/);
});

test("renderMarkdown never embeds the full transcript text", () => {
  const md = renderMarkdown(
    baseResult({
      transcript: {
        text: "UNIQUE_MARKER_SHOULD_NOT_APPEAR",
        source: "model",
        language: "en",
        segments: [],
      },
    }),
  );
  assert.doesNotMatch(md, /UNIQUE_MARKER_SHOULD_NOT_APPEAR/);
});

test("renderMarkdown lists the full lexical field", () => {
  const md = renderMarkdown(baseResult());
  assert.match(md, /`paw`, `leash`, `breed`/);
});

test("renderTerminalGraphic includes a percentage and a gauge", () => {
  const graphic = renderTerminalGraphic(baseResult({ obviousnessScore: 0.5 }));
  assert.match(graphic, /50%/);
  assert.match(graphic, /█+░+|░+█+|█+/);
});

test("renderTerminalGraphic caps bar rows at 10 and notes the remainder", () => {
  const matches = Array.from({ length: 15 }, (_, i) => ({ term: `term${i}`, count: 15 - i }));
  const graphic = renderTerminalGraphic(baseResult({ matches }));
  assert.match(graphic, /and 5 more/);
});
