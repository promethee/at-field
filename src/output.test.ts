import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildOutputPaths } from "./output.js";

test("buildOutputPaths uses the same directory as the input transcript", () => {
  const transcriptPath = path.join("home", "user", "transcripts", "episode.txt");
  const paths = buildOutputPaths(transcriptPath, "animals");
  assert.equal(path.dirname(paths.reportPath), path.dirname(transcriptPath));
});

test("buildOutputPaths slugifies the transcript basename and theme", () => {
  const paths = buildOutputPaths("My Podcast Episode!.txt", "Renewable Energy");
  assert.match(paths.reportFileName, /^my-podcast-episode\.renewable-energy\.[0-9a-f]{8}\.md$/);
});

test("buildOutputPaths produces distinct suffixes across calls (no collision)", () => {
  const a = buildOutputPaths("transcript.srt", "dogs");
  const b = buildOutputPaths("transcript.srt", "dogs");
  assert.notEqual(a.reportFileName, b.reportFileName);
});

test("buildOutputPaths falls back to 'untitled' for a theme that slugifies to nothing", () => {
  const paths = buildOutputPaths("transcript.txt", "!!!");
  assert.match(paths.reportFileName, /^transcript\.untitled\.[0-9a-f]{8}\.md$/);
});
