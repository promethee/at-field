import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "./analyze.js";
import type { LexicalFieldResult, TranscriptResult } from "./types.js";

function transcript(text: string): TranscriptResult {
  return { text, source: "model", language: "en" };
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
