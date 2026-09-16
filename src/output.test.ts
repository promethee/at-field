import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildOutputPaths } from "./output.js";

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
