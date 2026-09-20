import { test } from "node:test";
import assert from "node:assert/strict";
import { foldWord, sharedPrefixLength, shareStem, parseStemLength } from "./stems.js";

test("foldWord lowercases and strips accents", () => {
  assert.equal(foldWord("Économie"), "economie");
});

test("sharedPrefixLength counts matching leading letters", () => {
  assert.equal(sharedPrefixLength("voyage", "voyageur"), 6);
  assert.equal(sharedPrefixLength("jeu", "jeune"), 3);
  assert.equal(sharedPrefixLength("art", "dog"), 0);
});

test("shareStem matches identical words and words sharing the stem length", () => {
  assert.equal(shareStem("voyage", "voyageur", 5), true);
  assert.equal(shareStem("jeu", "jeune", 5), false);
  assert.equal(shareStem("art", "art", 5), true);
});

test("shareStem with stem length 0 matches identical words only", () => {
  assert.equal(shareStem("voyage", "voyageur", 0), false);
  assert.equal(shareStem("voyage", "voyage", 0), true);
});

test("parseStemLength returns undefined when the flag is absent", () => {
  assert.equal(parseStemLength(undefined), undefined);
});

test("parseStemLength accepts 0 and whole numbers from 3 to 12", () => {
  for (const ok of ["0", "3", "5", "12"]) assert.equal(parseStemLength(ok), Number(ok));
});

test("parseStemLength rejects other values", () => {
  for (const bad of ["1", "2", "13", "2.5", "abc", "", "-1"]) {
    assert.throws(() => parseStemLength(bad), /--stem-length must be 0 \(off\) or a whole number from 3 to 12/, bad);
  }
});
