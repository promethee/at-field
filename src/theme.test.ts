import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadLexicFile, cleanExpandedTerms, parseFieldSize } from "./theme.js";

test("parseFieldSize returns undefined when the flag is absent", () => {
  assert.equal(parseFieldSize(undefined), undefined);
});

test("parseFieldSize accepts whole numbers within the bounds", () => {
  assert.equal(parseFieldSize("5"), 5);
  assert.equal(parseFieldSize("25"), 25);
  assert.equal(parseFieldSize("100"), 100);
});

test("parseFieldSize rejects out-of-range, fractional, and non-numeric values", () => {
  for (const bad of ["4", "101", "2.5", "abc", "", "-10"]) {
    assert.throws(() => parseFieldSize(bad), /--field-size must be a whole number from 5 to 100/, bad);
  }
});

test("cleanExpandedTerms drops multi-word phrases", () => {
  assert.deepEqual(cleanExpandedTerms(["croissance", "croissance du secteur du travail", "impôt"]), [
    "croissance",
    "impôt",
  ]);
});

test("cleanExpandedTerms dedupes case- and accent-insensitively, keeping the first form", () => {
  assert.deepEqual(cleanExpandedTerms(["Économie", "economie", "ÉCONOMIE", "budget"]), ["Économie", "budget"]);
});

test("cleanExpandedTerms drops the theme's own words, accent- and case-insensitively", () => {
  assert.deepEqual(cleanExpandedTerms(["Économie", "budget", "guerre", "diplomatie"], "économie de guerre"), [
    "budget",
    "diplomatie",
  ]);
});

test("cleanExpandedTerms drops variants sharing 5+ leading letters, keeping the first listed", () => {
  assert.deepEqual(
    cleanExpandedTerms(["photographie", "photographe", "photographique", "voyage", "voyageur", "voyageuse"]),
    ["photographie", "voyage"],
  );
});

test("cleanExpandedTerms variant matching is accent-insensitive", () => {
  assert.deepEqual(cleanExpandedTerms(["décoration", "décorateur", "décoratrice"]), ["décoration"]);
});

test("cleanExpandedTerms keeps short-root and 4-letter-prefix pairs (conservative on purpose)", () => {
  const terms = ["art", "artistes", "jeu", "jeune", "lecture", "lecteur", "camping", "campagne", "parc", "parce"];
  assert.deepEqual(cleanExpandedTerms(terms), terms);
});

test("cleanExpandedTerms still dedupes short exact duplicates", () => {
  assert.deepEqual(cleanExpandedTerms(["art", "Art", "ART"]), ["art"]);
});

test("cleanExpandedTerms trims and drops empty entries", () => {
  assert.deepEqual(cleanExpandedTerms(["  paw ", "", "   "]), ["paw"]);
});

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
