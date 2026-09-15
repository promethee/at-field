import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "./analyze.js";
import type { LexicalFieldResult, TranscriptResult, TranscriptSegment } from "./types.js";

function transcript(text: string, segments: TranscriptSegment[] = []): TranscriptResult {
  return { text, source: "model", language: "en", segments };
}

function field(theme: string, terms: string[]): LexicalFieldResult {
  return { theme, terms, isThin: terms.length < 8 };
}

test("high obviousness: theme word dominates, few related terms", async () => {
  const t = transcript("dogs dogs dogs are great pets. dogs dogs dogs dogs.");
  const f = field("dogs", ["paw", "leash", "breed"]);
  const result = await analyze(t, f);
  assert.equal(result.obviousnessScore, 1);
});

test("low obviousness: related terms dominate, theme word rare", async () => {
  const t = transcript(
    "the budget was tight so we tracked cost carefully and tried to afford better ingredients on a shoestring.",
  );
  const f = field("economy", ["budget", "cost", "afford", "shoestring"]);
  const result = await analyze(t, f);
  assert.ok(result.obviousnessScore < 0.5, `expected < 0.5, got ${result.obviousnessScore}`);
});

test("zero matches yields obviousness score of 0", async () => {
  const t = transcript("completely unrelated content about weather and clouds.");
  const f = field("finance", ["stock", "bond", "interest"]);
  const result = await analyze(t, f);
  assert.equal(result.obviousnessScore, 0);
  assert.deepEqual(result.matches, []);
});

test("matches are sorted by count descending and exclude zero-count terms", async () => {
  const t = transcript("paw paw paw leash");
  const f = field("dogs", ["paw", "leash", "kennel"]);
  const result = await analyze(t, f);
  assert.deepEqual(
    result.matches.map((m) => m.term),
    ["paw", "leash"],
  );
  assert.equal(result.matches[0].count, 3);
});

test("multi-word terms match via word boundaries", async () => {
  const t = transcript("she bought some dog food yesterday.");
  const f = field("dogs", ["dog food"]);
  const result = await analyze(t, f);
  assert.equal(result.matches[0].count, 1);
});

test("matching is case-insensitive", async () => {
  const t = transcript("DOGS are loyal. Dogs bark.");
  const f = field("dogs", []);
  const result = await analyze(t, f);
  assert.equal(result.obviousnessScore, 1);
});

test("segmentHits: only segments containing a hit are included", async () => {
  const t = transcript("irrelevant intro. paw print found. nothing here either.", [
    { start: 0, end: 2, text: "irrelevant intro." },
    { start: 2, end: 5, text: "paw print found." },
    { start: 5, end: 8, text: "nothing here either." },
  ]);
  const f = field("dogs", ["paw"]);
  const result = await analyze(t, f);
  assert.equal(result.segmentHits.length, 1);
  assert.deepEqual(result.segmentHits[0], { start: 2, end: 5, terms: ["paw"] });
});

test("segmentHits: a segment can list multiple distinct hit terms", async () => {
  const t = transcript("paw and leash in one line.", [
    { start: 0, end: 3, text: "paw and leash in one line." },
  ]);
  const f = field("dogs", ["paw", "leash", "kennel"]);
  const result = await analyze(t, f);
  assert.equal(result.segmentHits.length, 1);
  assert.deepEqual(new Set(result.segmentHits[0].terms), new Set(["paw", "leash"]));
});

test("segmentHits is empty when no segments are provided", async () => {
  const t = transcript("paw leash", []);
  const f = field("dogs", ["paw", "leash"]);
  const result = await analyze(t, f);
  assert.deepEqual(result.segmentHits, []);
});
