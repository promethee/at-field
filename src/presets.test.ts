import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, resolvePreset } from "./presets.js";

test("resolvePreset returns the matching preset config", () => {
  assert.deepEqual(resolvePreset("fast"), PRESETS.fast);
  assert.deepEqual(resolvePreset("balanced"), PRESETS.balanced);
  assert.deepEqual(resolvePreset("best"), PRESETS.best);
});

test("only 'best' preset requires an upfront confirm", () => {
  assert.equal(PRESETS.fast.requiresUpfrontConfirm, false);
  assert.equal(PRESETS.balanced.requiresUpfrontConfirm, false);
  assert.equal(PRESETS.best.requiresUpfrontConfirm, true);
});

test("fast preset uses the smallest whisper model", () => {
  assert.equal(PRESETS.fast.whisperModel, "base");
});
