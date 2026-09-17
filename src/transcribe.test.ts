import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isModelCached } from "./transcribe.js";

test("isModelCached returns true when the model file exists", async (t) => {
  t.mock.method(fs, "existsSync", () => true);
  assert.equal(await isModelCached("base"), true);
});

test("isModelCached returns false when the model file is missing", async (t) => {
  t.mock.method(fs, "existsSync", () => false);
  assert.equal(await isModelCached("base"), false);
});

test("isModelCached rejects an unknown model name", async () => {
  await assert.rejects(() => isModelCached("not-a-real-model"), /Unknown whisper model/);
});
