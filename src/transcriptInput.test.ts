import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSubtitles, loadTranscriptFile } from "./transcriptInput.js";

function tempFile(name: string, content: string): string {
  const filePath = path.join(os.tmpdir(), `at-field-test-${Date.now()}-${name}`);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

test("parseSubtitles extracts segments from SRT (comma decimals, cue numbers)", () => {
  const srt = [
    "1",
    "00:00:00,000 --> 00:00:02,500",
    "Hello there.",
    "",
    "2",
    "00:00:02,500 --> 00:00:05,000",
    "General Kenobi.",
    "",
  ].join("\n");
  const segments = parseSubtitles(srt);
  assert.deepEqual(segments, [
    { start: 0, end: 2.5, text: "Hello there." },
    { start: 2.5, end: 5, text: "General Kenobi." },
  ]);
});

test("parseSubtitles extracts segments from WebVTT (dot decimals, header, no cue numbers)", () => {
  const vtt = [
    "WEBVTT",
    "",
    "00:00:00.000 --> 00:00:02.500",
    "Hello there.",
    "",
    "00:00:02.500 --> 00:00:05.000",
    "General Kenobi.",
    "",
  ].join("\n");
  const segments = parseSubtitles(vtt);
  assert.deepEqual(segments, [
    { start: 0, end: 2.5, text: "Hello there." },
    { start: 2.5, end: 5, text: "General Kenobi." },
  ]);
});

test("parseSubtitles handles hour-scale timestamps", () => {
  const srt = "1\n01:02:03,500 --> 01:02:04,000\nlate segment\n";
  const segments = parseSubtitles(srt);
  assert.equal(segments[0].start, 3723.5);
  assert.equal(segments[0].end, 3724);
});

test("parseSubtitles joins multi-line cue text into one segment", () => {
  const srt = "1\n00:00:00,000 --> 00:00:02,000\nFirst line\nSecond line\n";
  const segments = parseSubtitles(srt);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, "First line Second line");
});

test("parseSubtitles returns empty for content with no timestamp lines", () => {
  assert.deepEqual(parseSubtitles("just some text\nno timestamps here\n"), []);
});

test("loadTranscriptFile parses .srt with real segments", () => {
  const filePath = tempFile("t.srt", "1\n00:00:00,000 --> 00:00:02,000\nHello world\n");
  const result = loadTranscriptFile(filePath);
  assert.equal(result.source, "manual");
  assert.equal(result.segments.length, 1);
  assert.equal(result.text, "Hello world");
  fs.unlinkSync(filePath);
});

test("loadTranscriptFile parses .vtt with real segments", () => {
  const filePath = tempFile("t.vtt", "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello world\n");
  const result = loadTranscriptFile(filePath);
  assert.equal(result.segments.length, 1);
  assert.equal(result.text, "Hello world");
  fs.unlinkSync(filePath);
});

test("loadTranscriptFile treats .txt as raw text with no segments", () => {
  const filePath = tempFile("t.txt", "  Hello world, this is plain text.  ");
  const result = loadTranscriptFile(filePath);
  assert.deepEqual(result.segments, []);
  assert.equal(result.text, "Hello world, this is plain text.");
  fs.unlinkSync(filePath);
});

test("loadTranscriptFile detects language directly from the transcript text", () => {
  const filePath = tempFile("t.txt", "les chiens et les chats sont des animaux domestiques");
  const result = loadTranscriptFile(filePath);
  assert.equal(result.language, "fr");
  fs.unlinkSync(filePath);
});

test("loadTranscriptFile falls back to 'unknown' when language can't be detected", () => {
  const filePath = tempFile("t.txt", "ok");
  const result = loadTranscriptFile(filePath);
  assert.equal(result.language, "unknown");
  fs.unlinkSync(filePath);
});

test("loadTranscriptFile throws when the file doesn't exist", () => {
  assert.throws(() => loadTranscriptFile("/tmp/at-field-does-not-exist.txt"), /Transcript file not found/);
});
