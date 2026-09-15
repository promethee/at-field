import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isModelCached, parseWhisperOutput } from "./transcribe.js";

test("isModelCached returns true when the model file exists", async (t) => {
  t.mock.method(fs, "existsSync", () => true);
  assert.equal(await isModelCached("base"), true);
});

test("isModelCached returns false when the model file is missing", async (t) => {
  t.mock.method(fs, "existsSync", () => false);
  assert.equal(await isModelCached("base"), false);
});

test("isModelCached rejects an unknown model name", async () => {
  await assert.rejects(() => isModelCached("not-a-real-model"), /Unknown whisper model/);
});

test("parseWhisperOutput extracts segments with start/end/text", () => {
  const stdout = [
    "[00:00:00.000 --> 00:00:02.500]   Hello there.",
    "[00:00:02.500 --> 00:00:05.000]   General Kenobi.",
  ].join("\n");
  const result = parseWhisperOutput(stdout);
  assert.deepEqual(result.segments, [
    { start: 0, end: 2.5, text: "Hello there." },
    { start: 2.5, end: 5, text: "General Kenobi." },
  ]);
});

test("parseWhisperOutput joins segment texts into full text", () => {
  const stdout = [
    "[00:00:00.000 --> 00:00:02.000]   First segment.",
    "[00:00:02.000 --> 00:00:04.000]   Second segment.",
  ].join("\n");
  const result = parseWhisperOutput(stdout);
  assert.equal(result.text, "First segment. Second segment.");
});

test("parseWhisperOutput handles hour-scale timestamps", () => {
  const stdout = "[01:02:03.500 --> 01:02:04.000]   late segment";
  const result = parseWhisperOutput(stdout);
  assert.equal(result.segments[0].start, 3723.5);
  assert.equal(result.segments[0].end, 3724);
});

test("parseWhisperOutput ignores non-segment lines and empty segments", () => {
  const stdout = [
    "[Nodejs-whisper] Transcribing Done!",
    "[00:00:00.000 --> 00:00:01.000]   ",
    "[00:00:01.000 --> 00:00:02.000]   actual text",
  ].join("\n");
  const result = parseWhisperOutput(stdout);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].text, "actual text");
});

test("parseWhisperOutput returns empty segments/text for no matches", () => {
  const result = parseWhisperOutput("no timestamped lines here");
  assert.deepEqual(result.segments, []);
  assert.equal(result.text, "");
});
