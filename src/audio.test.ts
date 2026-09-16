import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAudioDurationSeconds, trimToMaxDuration } from "./audio.js";

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
