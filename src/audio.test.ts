import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAudioDurationSeconds, trimToMaxDuration, trimToRange, parseTimeToSeconds } from "./audio.js";

const execFileAsync = promisify(execFile);

let tonePath: string;

before(async () => {
  tonePath = path.join(os.tmpdir(), `at-field-test-tone-${Date.now()}.wav`);
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=10",
    "-c:a",
    "pcm_s16le",
    tonePath,
  ]);
});

after(() => {
  if (fs.existsSync(tonePath)) fs.unlinkSync(tonePath);
});

test("getAudioDurationSeconds reads a real audio file's duration", async () => {
  const seconds = await getAudioDurationSeconds(tonePath);
  assert.ok(Math.abs(seconds - 10) < 0.5, `expected ~10s, got ${seconds}`);
});

test("getAudioDurationSeconds throws on a missing/invalid file", async () => {
  await assert.rejects(() => getAudioDurationSeconds("/tmp/at-field-does-not-exist.wav"));
});

test("trimToMaxDuration disables the cap entirely when maxDurationMinutes <= 0", async () => {
  const result = await trimToMaxDuration(tonePath, 0);
  assert.equal(result.trimmed, false);
  assert.equal(result.path, tonePath);
  assert.equal(result.cappedSeconds, null);
  assert.doesNotThrow(() => result.cleanup());
});

test("trimToMaxDuration passes through audio already under the cap", async () => {
  const result = await trimToMaxDuration(tonePath, 1); // 60s cap, audio is ~10s
  assert.equal(result.trimmed, false);
  assert.equal(result.path, tonePath);
  assert.doesNotThrow(() => result.cleanup());
});

test("trimToMaxDuration trims audio over the cap and reports both durations", async () => {
  const result = await trimToMaxDuration(tonePath, 0.1); // 6s cap
  assert.equal(result.trimmed, true);
  assert.notEqual(result.path, tonePath);
  assert.ok(Math.abs(result.originalSeconds - 10) < 0.5);
  assert.equal(result.cappedSeconds, 6);

  const trimmedDuration = await getAudioDurationSeconds(result.path);
  assert.ok(trimmedDuration <= 6.5, `expected trimmed file <= ~6.5s, got ${trimmedDuration}`);

  result.cleanup();
  assert.equal(fs.existsSync(result.path), false);
});

test("cleanup() is a no-op when the file was never trimmed", async () => {
  const result = await trimToMaxDuration(tonePath, 0);
  assert.doesNotThrow(() => result.cleanup());
  assert.equal(fs.existsSync(tonePath), true); // original file untouched
});

test("trimToMaxDuration with cap disabled still reports NaN duration rather than throwing on an unprobeable file", async () => {
  const result = await trimToMaxDuration("/tmp/at-field-does-not-exist.wav", 0);
  assert.equal(result.trimmed, false);
  assert.ok(Number.isNaN(result.originalSeconds));
});

test("parseTimeToSeconds accepts plain seconds", () => {
  assert.equal(parseTimeToSeconds("90"), 90);
  assert.equal(parseTimeToSeconds("90.5"), 90.5);
});

test("parseTimeToSeconds accepts MM:SS and HH:MM:SS", () => {
  assert.equal(parseTimeToSeconds("01:30"), 90);
  assert.equal(parseTimeToSeconds("01:02:03"), 3723);
});

test("parseTimeToSeconds rejects malformed input", () => {
  assert.throws(() => parseTimeToSeconds("abc"), /invalid time value/);
  assert.throws(() => parseTimeToSeconds("1:2:3:4"), /invalid time value/);
  assert.throws(() => parseTimeToSeconds(""), /invalid time value/);
  assert.throws(() => parseTimeToSeconds("-5"), /invalid time value/);
});

test("trimToRange disables extraction entirely when neither start nor end is given", async () => {
  const result = await trimToRange(tonePath, null, null);
  assert.equal(result.trimmed, false);
  assert.equal(result.path, tonePath);
  assert.equal(result.range, null);
  assert.doesNotThrow(() => result.cleanup());
});

test("trimToRange extracts [start, end) into a temp file", async () => {
  const result = await trimToRange(tonePath, 2, 6); // 10s tone -> take seconds 2-6
  assert.equal(result.trimmed, true);
  assert.notEqual(result.path, tonePath);
  assert.deepEqual(result.range, { startSeconds: 2, endSeconds: 6 });

  const extractedDuration = await getAudioDurationSeconds(result.path);
  assert.ok(Math.abs(extractedDuration - 4) < 0.5, `expected ~4s, got ${extractedDuration}`);

  result.cleanup();
  assert.equal(fs.existsSync(result.path), false);
});

test("trimToRange with only --start given runs to the original audio's end", async () => {
  const result = await trimToRange(tonePath, 7, null);
  assert.equal(result.trimmed, true);
  assert.deepEqual(result.range, { startSeconds: 7, endSeconds: null });

  const extractedDuration = await getAudioDurationSeconds(result.path);
  assert.ok(Math.abs(extractedDuration - 3) < 0.5, `expected ~3s, got ${extractedDuration}`);

  result.cleanup();
});

test("trimToRange clamps an --end beyond the audio's actual duration", async () => {
  const result = await trimToRange(tonePath, 0, 999);
  assert.ok(Math.abs((result.range?.endSeconds ?? 0) - 10) < 0.5, `expected clamp to ~10s, got ${result.range?.endSeconds}`);
  result.cleanup();
});

test("trimToRange rejects --start at or past the audio's duration", async () => {
  await assert.rejects(() => trimToRange(tonePath, 999, null), /at or past the audio's duration/);
});

test("trimToRange rejects --end at or before --start", async () => {
  await assert.rejects(() => trimToRange(tonePath, 5, 5), /must be after --start/);
  await assert.rejects(() => trimToRange(tonePath, 5, 3), /must be after --start/);
});
