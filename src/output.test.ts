import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { buildOutputPaths, findExistingTranscript } from "./output.js";

test("buildOutputPaths uses the same directory as the input audio", () => {
  const audioPath = path.join("home", "user", "recordings", "episode.mp3");
  const paths = buildOutputPaths(audioPath, "animals");
  assert.equal(path.dirname(paths.reportPath), path.dirname(audioPath));
  assert.equal(path.dirname(paths.transcriptPath), path.dirname(audioPath));
});

test("buildOutputPaths slugifies the audio basename and theme", () => {
  const paths = buildOutputPaths("My Podcast Episode!.mp3", "Renewable Energy");
  assert.match(paths.reportFileName, /^my-podcast-episode\.renewable-energy\.[0-9a-f]{8}\.md$/);
});

test("buildOutputPaths pairs a matching report and transcript filename stem", () => {
  const paths = buildOutputPaths("audio.wav", "dogs");
  const reportStem = paths.reportFileName.replace(/\.md$/, "");
  const transcriptStem = paths.transcriptFileName.replace(/\.transcript\.txt$/, "");
  assert.equal(reportStem, transcriptStem);
});

test("buildOutputPaths produces distinct suffixes across calls (no collision)", () => {
  const a = buildOutputPaths("audio.wav", "dogs");
  const b = buildOutputPaths("audio.wav", "dogs");
  assert.notEqual(a.reportFileName, b.reportFileName);
});

test("buildOutputPaths falls back to 'untitled' for a theme that slugifies to nothing", () => {
  const paths = buildOutputPaths("audio.wav", "!!!");
  assert.match(paths.reportFileName, /^audio\.untitled\.[0-9a-f]{8}\.md$/);
});

test("findExistingTranscript returns null when no matching file exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "at-field-test-"));
  const audioPath = path.join(dir, "episode.mp3");
  fs.writeFileSync(audioPath, "");
  const result = findExistingTranscript(audioPath, "animals");
  assert.equal(result, null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("findExistingTranscript finds a matching transcript file for the same audio+theme", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "at-field-test-"));
  const audioPath = path.join(dir, "episode.mp3");
  fs.writeFileSync(audioPath, "");
  const transcriptName = "episode.animals.a1b2c3d4.transcript.txt";
  fs.writeFileSync(path.join(dir, transcriptName), "some transcript text");

  const result = findExistingTranscript(audioPath, "animals");
  assert.notEqual(result, null);
  assert.equal(result!.fileName, transcriptName);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("findExistingTranscript ignores transcripts from a different theme", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "at-field-test-"));
  const audioPath = path.join(dir, "episode.mp3");
  fs.writeFileSync(audioPath, "");
  fs.writeFileSync(path.join(dir, "episode.economy.a1b2c3d4.transcript.txt"), "text");

  const result = findExistingTranscript(audioPath, "animals");
  assert.equal(result, null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("findExistingTranscript returns null when the directory can't be read", () => {
  const result = findExistingTranscript("/nonexistent-dir-at-field/episode.mp3", "animals");
  assert.equal(result, null);
});

test("findExistingTranscript returns the most recently modified match when several exist", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "at-field-test-"));
  const audioPath = path.join(dir, "episode.mp3");
  fs.writeFileSync(audioPath, "");

  const older = path.join(dir, "episode.animals.aaaaaaaa.transcript.txt");
  const newer = path.join(dir, "episode.animals.bbbbbbbb.transcript.txt");
  fs.writeFileSync(older, "old");
  fs.writeFileSync(newer, "new");
  const now = Date.now() / 1000;
  fs.utimesSync(older, now - 100, now - 100);
  fs.utimesSync(newer, now, now);

  const result = findExistingTranscript(audioPath, "animals");
  assert.equal(result!.fileName, "episode.animals.bbbbbbbb.transcript.txt");
  fs.rmSync(dir, { recursive: true, force: true });
});
