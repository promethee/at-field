import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveVerbosity, shortNotes, formatNotes } from "./notes.js";

test("resolveVerbosity defaults to normal", () => {
  assert.equal(resolveVerbosity({}), "normal");
});

test("resolveVerbosity honours --quiet and --verbose", () => {
  assert.equal(resolveVerbosity({ quiet: true }), "quiet");
  assert.equal(resolveVerbosity({ verbose: true }), "verbose");
});

test("resolveVerbosity rejects both flags together", () => {
  assert.throws(() => resolveVerbosity({ quiet: true, verbose: true }), /cannot be combined/);
});

test("shortNotes is empty when nothing applies", () => {
  assert.deepEqual(shortNotes({ hasTimestamps: true, isThin: false, fieldSize: 25 }), []);
});

test("shortNotes reports missing timestamps and a thin field", () => {
  assert.deepEqual(shortNotes({ hasTimestamps: false, isThin: true, fieldSize: 5 }), [
    "plain-text input has no timestamps",
    "thin field (5 words)",
  ]);
});

test("formatNotes joins notes on one line and returns null when there are none", () => {
  assert.equal(formatNotes([]), null);
  assert.equal(formatNotes(["a", "b"]), "Notes: a; b");
});
