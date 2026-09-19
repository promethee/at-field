import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLanguageCode } from "./language.js";

test("detectLanguageCode confidently identifies a clear English sentence", () => {
  const result = detectLanguageCode("the quick brown fox jumps over the lazy dog");
  assert.equal(result.code, "en");
  assert.equal(result.confident, true);
});

test("detectLanguageCode confidently identifies a clear French sentence", () => {
  const result = detectLanguageCode("les chiens et les chats sont des animaux domestiques");
  assert.equal(result.code, "fr");
  assert.equal(result.confident, true);
});

test("detectLanguageCode is not confident on a short single word", () => {
  const result = detectLanguageCode("animals");
  assert.equal(result.confident, false);
  assert.equal(result.code, null);
});
