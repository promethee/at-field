import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "./analyze.js";
import type { LexicalFieldResult, TranscriptResult, TranscriptSegment } from "./types.js";

function transcript(text: string, segments: TranscriptSegment[] = []): TranscriptResult {
  return { text, language: "en", segments };
}

function field(theme: string, terms: string[]): LexicalFieldResult {
  return { theme, terms, isThin: terms.length < 8 };
}

test("saturation is distinct field terms found / field size", async () => {
  const t = transcript("the budget and the cost were discussed, but never any profit.");
  const f = field("economy", ["budget", "cost", "profit", "tax", "wage"]);
  const result = await analyze(t, f);
  assert.equal(result.termsFound, 3);
  assert.equal(result.fieldSize, 5);
  assert.equal(result.saturation, 0.6);
});

test("saturation counts each distinct term once, however often it occurs", async () => {
  const t = transcript("paw paw paw paw paw leash");
  const f = field("dogs", ["paw", "leash", "kennel", "breed"]);
  const result = await analyze(t, f);
  assert.equal(result.saturation, 0.5);
});

test("saturation does not depend on the literal theme word being spoken", async () => {
  const t = transcript("the budget was tight so we tracked cost and hunted for a bargain.");
  const f = field("economy", ["budget", "cost", "bargain"]);
  const result = await analyze(t, f);
  assert.equal(result.saturation, 1);
});

test("zero matches yields saturation of 0", async () => {
  const t = transcript("completely unrelated content about weather and clouds.");
  const f = field("finance", ["stock", "bond", "interest"]);
  const result = await analyze(t, f);
  assert.equal(result.saturation, 0);
  assert.deepEqual(result.matches, []);
});

test("an empty field yields saturation of 0 instead of dividing by zero", async () => {
  const result = await analyze(transcript("anything at all"), field("dogs", []));
  assert.equal(result.saturation, 0);
  assert.equal(result.fieldSize, 0);
});

test("matchesPer1000Words scales total matches by transcript length", async () => {
  // 10 words, 2 matches -> 200 per 1,000
  const t = transcript("paw one two three leash five six seven eight nine");
  const result = await analyze(t, field("dogs", ["paw", "leash"]));
  assert.equal(result.matchesPer1000Words, 200);
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
  const f = field("dogs", ["dogs"]);
  const result = await analyze(t, f);
  assert.equal(result.matches[0].count, 2);
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
