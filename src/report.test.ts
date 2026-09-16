import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, renderTerminalGraphic, computeObviousnessStep } from "./report.js";
import type { AnalysisResult } from "./types.js";

function baseResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    transcript: { text: "paw leash", source: "model", language: "en", segments: [], durationCap: null },
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

test("computeObviousnessStep divides the range evenly (default 2 steps)", () => {
  assert.deepEqual(computeObviousnessStep(0.2), { step: 1, totalSteps: 2, rangeStart: 0, rangeEnd: 0.5 });
  assert.deepEqual(computeObviousnessStep(0.8), { step: 2, totalSteps: 2, rangeStart: 0.5, rangeEnd: 1 });
});

test("computeObviousnessStep handles exact boundary at score 1.0 without overflowing", () => {
  const result = computeObviousnessStep(1.0, 4);
  assert.equal(result.step, 4);
  assert.equal(result.totalSteps, 4);
});

test("computeObviousnessStep handles score 0 as the first step", () => {
  const result = computeObviousnessStep(0, 4);
  assert.equal(result.step, 1);
});

test("computeObviousnessStep supports arbitrary step counts", () => {
  const result = computeObviousnessStep(0.6, 5);
  // 0.6 * 5 = 3.0 -> floor = 3 -> step index 3 -> step 4/5, band 60-80%
  assert.equal(result.step, 4);
  assert.equal(result.totalSteps, 5);
  assert.equal(result.rangeStart, 0.6);
  assert.equal(result.rangeEnd, 0.8);
});

test("computeObviousnessStep rejects a non-positive-integer step count", () => {
  assert.throws(() => computeObviousnessStep(0.5, 0), /positive integer/);
  assert.throws(() => computeObviousnessStep(0.5, 1.5), /positive integer/);
  assert.throws(() => computeObviousnessStep(0.5, -1), /positive integer/);
});

test("renderMarkdown includes the theme in the title", () => {
  const md = renderMarkdown(baseResult());
  assert.match(md, /# Thematic Analysis: "dogs"/);
});

test("renderMarkdown shows the obviousness score as a percentage and step", () => {
  const md = renderMarkdown(baseResult({ obviousnessScore: 0.42 }));
  assert.match(md, /\*\*42%\*\*/);
  assert.match(md, /step 1\/2 \(band: 0%–50%\)/);
});

test("renderMarkdown respects a custom obviousnessSteps option", () => {
  const md = renderMarkdown(baseResult({ obviousnessScore: 0.6 }), { obviousnessSteps: 4 });
  assert.match(md, /step 3\/4 \(band: 50%–75%\)/);
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
        durationCap: null,
      },
    }),
  );
  assert.doesNotMatch(md, /UNIQUE_MARKER_SHOULD_NOT_APPEAR/);
});

test("renderMarkdown lists the full lexical field", () => {
  const md = renderMarkdown(baseResult());
  assert.match(md, /`paw`, `leash`, `breed`/);
});

test("renderMarkdown includes a duration-cap disclaimer when durationCap is set", () => {
  const md = renderMarkdown(
    baseResult({
      transcript: {
        text: "paw leash",
        source: "model",
        language: "en",
        segments: [],
        durationCap: { originalSeconds: 3600, cappedSeconds: 600 },
      },
    }),
  );
  assert.match(md, /Duration cap: audio was 60\.0 min, trimmed to the first 10\.0 min/);
});

test("renderMarkdown omits the duration-cap disclaimer when durationCap is null", () => {
  const md = renderMarkdown(baseResult());
  assert.doesNotMatch(md, /Duration cap:/);
});

test("renderMarkdown references the real transcript filename when provided", () => {
  const md = renderMarkdown(baseResult(), { transcriptFileName: "episode.dogs.a1b2c3d4.transcript.txt" });
  assert.match(md, /See `episode\.dogs\.a1b2c3d4\.transcript\.txt` \(same directory\)/);
});

test("renderMarkdown falls back to a generic transcript line when no filename is given", () => {
  const md = renderMarkdown(baseResult());
  assert.match(md, /See the separate transcript file/);
});

test("renderMarkdown shows a no-matches message when matches is empty", () => {
  const md = renderMarkdown(baseResult({ matches: [] }));
  assert.match(md, /No field terms were found in the transcript\./);
});

test("renderMarkdown shows a no-occurrences message when segmentHits is empty", () => {
  const md = renderMarkdown(baseResult({ segmentHits: [] }));
  assert.match(md, /No timestamped occurrences found\./);
});

test("renderMarkdown shows a no-terms message when the field is empty", () => {
  const md = renderMarkdown(baseResult({ field: { theme: "dogs", terms: [], isThin: true } }));
  assert.match(md, /no terms — static wordlist was empty or theme expansion returned none/);
});

test("renderMarkdown formats hour-scale timestamps as HH:MM:SS", () => {
  const md = renderMarkdown(
    baseResult({ segmentHits: [{ start: 3723.5, end: 3730, terms: ["paw"] }] }),
  );
  assert.match(md, /\[01:02:03–01:02:10\]: paw/);
});

test("renderTerminalGraphic includes a percentage, gauge, and step", () => {
  const graphic = renderTerminalGraphic(baseResult({ obviousnessScore: 0.5 }));
  assert.match(graphic, /50%/);
  assert.match(graphic, /step 2\/2/);
  assert.match(graphic, /█+░+|░+█+|█+/);
});

test("renderTerminalGraphic respects a custom obviousnessSteps option", () => {
  const graphic = renderTerminalGraphic(baseResult({ obviousnessScore: 0.6 }), { obviousnessSteps: 4 });
  assert.match(graphic, /step 3\/4/);
});

test("renderTerminalGraphic omits the bar chart when there are no matches", () => {
  const graphic = renderTerminalGraphic(baseResult({ matches: [] }));
  assert.doesNotMatch(graphic, /█.*\d+$/m);
  assert.match(graphic, /Obviousness/);
});

test("renderTerminalGraphic caps bar rows at 10 and notes the remainder", () => {
  const matches = Array.from({ length: 15 }, (_, i) => ({ term: `term${i}`, count: 15 - i }));
  const graphic = renderTerminalGraphic(baseResult({ matches }));
  assert.match(graphic, /and 5 more/);
});
