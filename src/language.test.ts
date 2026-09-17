import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLanguageCode, checkLanguageMatch, extractWhisperDetectedLanguage } from "./language.js";

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

test("checkLanguageMatch returns match when languages agree", () => {
  const result = checkLanguageMatch("the quick brown fox jumps over the lazy dog", "en");
  assert.equal(result, "match");
});

test("checkLanguageMatch returns mismatch when languages clearly disagree", () => {
  const result = checkLanguageMatch("les chiens et les chats sont des animaux domestiques", "en");
  assert.equal(result, "mismatch");
});

test("checkLanguageMatch returns ambiguous for an undetectable short theme", () => {
  const result = checkLanguageMatch("animals", "en");
  assert.equal(result, "ambiguous");
});

test("extractWhisperDetectedLanguage parses the real whisper.cpp log line format", () => {
  const lines = [
    "whisper_init_from_file_with_params_no_state: loading model",
    "whisper_full_with_state: auto-detected language: en (p = 0.988642)",
    "some other line",
  ];
  assert.equal(extractWhisperDetectedLanguage(lines), "en");
});

test("extractWhisperDetectedLanguage returns null when no such line is present", () => {
  assert.equal(extractWhisperDetectedLanguage(["nothing relevant here"]), null);
});

test("extractWhisperDetectedLanguage is case-insensitive on the prefix", () => {
  assert.equal(extractWhisperDetectedLanguage(["AUTO-DETECTED LANGUAGE: fr (p = 0.9)"]), "fr");
});
