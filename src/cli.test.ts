import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// These run the real CLI with --lexic, so no Ollama model is involved.
const CLI = fileURLToPath(new URL("./cli.ts", import.meta.url));

let dir: string;
let txt: string;
let srt: string;
let fullList: string;
let shortList: string;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "at-field-cli-"));
  txt = path.join(dir, "talk.txt");
  srt = path.join(dir, "talk.srt");
  fullList = path.join(dir, "full.txt");
  shortList = path.join(dir, "short.txt");
  fs.writeFileSync(txt, "The paw and the leash. A collar, a bone.\n");
  fs.writeFileSync(srt, "1\n00:00:00,000 --> 00:00:03,000\nThe paw and the leash.\n\n2\n00:00:03,000 --> 00:00:06,000\nA collar, a bone.\n");
  fs.writeFileSync(fullList, "paw\nleash\nbark\ntail\nfur\nbone\nkennel\ncollar\n");
  fs.writeFileSync(shortList, "paw\nleash\nbone\n");
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

function run(...args: string[]) {
  const r = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("default output: graphic and report path on stdout, no Markdown dump, a notes line on stderr", () => {
  const r = run(txt, "--theme", "dogs", "--lexic", fullList);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Saturation \[/);
  assert.match(r.stdout, /Written: /);
  assert.doesNotMatch(r.stdout, /# Thematic Analysis/);
  assert.match(r.stderr, /Notes: plain-text input has no timestamps/);
  assert.doesNotMatch(r.stderr, /Transcript quality disclaimer/);
});

test("default output prints no notes line when nothing applies", () => {
  const r = run(srt, "--theme", "dogs", "--lexic", fullList);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
});

test("default output notes a thin field", () => {
  const r = run(srt, "--theme", "dogs", "--lexic", shortList);
  assert.match(r.stderr, /Notes: thin field \(3 words\)/);
});

test("--verbose also prints the Markdown report and the long notices", () => {
  const r = run(txt, "--theme", "dogs", "--lexic", fullList, "--verbose");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /# Thematic Analysis: "dogs"/);
  assert.match(r.stderr, /Transcript quality disclaimer/);
  assert.match(r.stderr, /No-timestamps disclaimer/);
});

test("--quiet prints only the report path", () => {
  const r = run(srt, "--theme", "dogs", "--lexic", fullList, "--quiet");
  assert.equal(r.status, 0);
  const lines = r.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].endsWith(".md"));
  assert.ok(fs.existsSync(lines[0]));
  assert.equal(r.stderr, "");
});

test("--quiet and --verbose together are rejected", () => {
  const r = run(srt, "--theme", "dogs", "--lexic", fullList, "--quiet", "--verbose");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /cannot be combined/);
});
