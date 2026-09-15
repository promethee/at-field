import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadLexicFile } from "./theme.js";

function tmpFile(contents: string): string {
  const file = path.join(os.tmpdir(), `at-field-lexic-${Date.now()}-${Math.random()}.txt`);
  fs.writeFileSync(file, contents, "utf-8");
  return file;
}

test("loadLexicFile parses one term per line", async () => {
  const file = tmpFile("paw\nleash\nbreed\n");
  const result = await loadLexicFile(file, "animals");
  assert.deepEqual(result.terms, ["paw", "leash", "breed"]);
  fs.unlinkSync(file);
});

test("loadLexicFile ignores blank lines and comments", async () => {
  const file = tmpFile("paw\n\n# not a term\nleash\n   \nbreed\n");
  const result = await loadLexicFile(file, "animals");
  assert.deepEqual(result.terms, ["paw", "leash", "breed"]);
  fs.unlinkSync(file);
});

test("loadLexicFile deduplicates terms", async () => {
  const file = tmpFile("paw\npaw\nleash\n");
  const result = await loadLexicFile(file, "animals");
  assert.deepEqual(result.terms, ["paw", "leash"]);
  fs.unlinkSync(file);
});

test("loadLexicFile flags a thin field (< 8 terms)", async () => {
  const file = tmpFile("paw\nleash\n");
  const result = await loadLexicFile(file, "animals");
  assert.equal(result.isThin, true);
});

test("loadLexicFile throws when the file doesn't exist", async () => {
  await assert.rejects(() => loadLexicFile("/tmp/does-not-exist-at-field.txt", "animals"), /not found/);
});

test("loadLexicFile uses the passed-in theme, not the filename", async () => {
  // Regression test for the theme/lexic defect: --theme must always be the
  // analysis anchor, even when --lexic supplies the terms. The wordlist's
  // filename must never leak into the result as the theme.
  const file = tmpFile("paw\nleash\nbreed\n");
  const result = await loadLexicFile(file, "animals");
  assert.equal(result.theme, "animals");
  assert.notEqual(result.theme, path.basename(file));
  fs.unlinkSync(file);
});
