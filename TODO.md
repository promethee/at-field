# TODO.md

Status: transcription + confirm-prompt pipeline implemented and tested.
Theme/lexic defect (below) is fixed and regression-tested. `report.ts` is
still a stub — nothing else currently known broken.

How to use this file: every `[x]` must have a file reference and an
acceptance criterion (what specifically makes it true) — not just "done".
If you (Claude) mark something `[x]` without both, that's a process
violation — stop and fix the checklist entry, don't just fix the code.

## Fixed defects

- [x] **`--lexic` silently broke `--theme`'s role as the analysis anchor.**
  Was: `loadLexicFile(filePath)` derived `theme` from the wordlist's
  filename; `cli.ts` accepted "one of `--theme` or `--lexic`".
  Fix applied:
  1. `src/cli.ts` — `--theme` is now required in all cases (`--lexic` alone
     no longer satisfies the check).
  2. `src/theme.ts` — `loadLexicFile(filePath, theme)` now takes `theme` as
     a required parameter and returns it verbatim, never the filename.
  3. `src/cli.ts` call site — `loadLexicFile(options.lexic, options.theme!)`.
  4. `src/theme.test.ts` — old assertions updated to pass `theme` explicitly;
     added a regression test (`loadLexicFile uses the passed-in theme, not
     the filename`) asserting the filename never leaks into `result.theme`.
  **Verified:** 18/18 tests pass, typecheck clean.

## v1 scope — transcription pipeline

- [x] Audio input handling: any common format, conversion delegated to `nodejs-whisper` (ffmpeg internally). File: `src/transcribe.ts`.
- [x] Local Whisper integration (`nodejs-whisper`, wraps whisper.cpp) — model download, cache check, inference. File: `src/transcribe.ts`. Tested: `src/transcribe.test.ts` (only `isModelCached()`, mocked `fs` — `transcribe()` itself is untested, real audio+model required).
- [x] `--whisper-model=tiny|base|small|medium|large` flag, default via preset. File: `src/cli.ts`.
- [x] First-run download-size confirm, skipped if model already cached. File: `src/confirm.ts` + wired in `src/cli.ts`. Untested (interactive prompt, no test harness for it yet).
- [x] `--preset fast|balanced|best` — bundles whisper-model + max-duration + theme-mode defaults. File: `src/presets.ts`. Tested: `src/presets.test.ts`. `best` triggers the upfront confirm in `cli.ts`.
- [x] Per-run transcript-quality disclaimer, always shown (not just low-trust tiers). Printed in `src/cli.ts` after transcription. Currently one fixed message for the only v1 source (`model`) — will need per-source variants if caption-tier sources return later; N/A for now.
- [ ] `--language` flag(s) — flag exists in `cli.ts` and is passed through to `transcribe()`, but "default auto-detect, explicit override" behavior is not verified end-to-end, and interaction with theme-expansion language (see Open decisions) is undecided.

## v1 scope — theme / lexical analysis

- [x] `--theme "<value>"` flag, required in all cases. File: `src/cli.ts`.
- [x] Local LLM-based dynamic lexical-field expansion from theme value. File: `src/theme.ts::expandTheme` (`node-llama-cpp`, in-process, JSON-schema-constrained output). **Untested end-to-end** — Hugging Face model download is outside this sandbox's allowed network; verify on your machine before trusting it.
- [x] `--lexic words.txt` — static wordlist override, `--theme` still the analysis anchor. File: `src/theme.ts::loadLexicFile(filePath, theme)`. Tested: `src/theme.test.ts`, including the regression test above.
- [x] Thin-field detection: fixed threshold (< 8 terms), applied to both dynamic and static paths, exposed as `LexicalFieldResult.isThin`. Kept separate from the obviousness score (two distinct warnings, per design discussion). Tested for the static path in `src/theme.test.ts`; not tested for the dynamic path (same untested-model caveat as above).
- [x] Obviousness score computation — `literalThemeMatches / totalFieldMatches`, 0 matches → score 0. File: `src/analyze.ts`. Tested: `src/analyze.test.ts` (6 cases: high/low obviousness, zero matches, sort order, multi-word terms, case-insensitivity). Now correct on the `--lexic` path too, since `field.theme` is fixed.
- [x] Output shape decided: `obviousnessScore` (0..1) + sorted `matches: {term, count}[]` on `AnalysisResult` (`src/types.ts`). Markdown rendering of this shape is `report.ts`'s job — still pending.

## v1 scope — segment / duration handling

- [ ] `--max-duration=<minutes>` flag — flag is parsed in `cli.ts` and defaulted via preset, but nothing in the pipeline actually enforces/truncates by it yet. Not done.
- [ ] `--max-duration=0` disables cap — not implemented (depends on the above).
- [ ] `--start`/`--end` or `--segment=00:00-30:00` explicit range flags — not implemented at all.
- [ ] Truncation notice when default cap applies — not implemented.

## v1 scope — output

- [ ] `src/report.ts::renderMarkdown` — stub, throws `not implemented`.
- [ ] `src/report.ts::renderTerminalGraphic` — stub, throws `not implemented`.
- [ ] Default output file naming/location convention — not decided, not implemented (does the Markdown get written to disk, or only printed to stdout? Currently `cli.ts` only prints).

## Explicitly deferred / out of scope for v1

- Theme-discovery mode (no `--theme` given) — rejected, see INTENT.md.
- Subject→topic promotion logic — rejected, see INTENT.md.
- Non-Markdown output formats (JSON, HTML, PDF).
- Hosted/API-based transcription or theme-expansion fallback.
- Multi-transcript / batch processing.
- Persistent project/workspace state (ThemeForge-style).

## Testing

- [x] Test runner: `node:test` (built-in, zero deps — chosen over vitest).
- [x] `npm test` / `npm run test:watch` / `npm run test:coverage` scripts (Node's built-in `--experimental-test-coverage`, no dependency).
- [x] `src/presets.test.ts` — config table correctness. 3 tests.
- [x] `src/transcribe.test.ts` — `isModelCached()` only (mocked `fs`). 3 tests.
- [x] `src/theme.test.ts` — `loadLexicFile()`, including the theme/lexic regression test. 6 tests.
- [x] `src/analyze.test.ts` — obviousness score + matching logic. 6 tests.
- [ ] Tests for `expandTheme()` — needs a mocking strategy for `node-llama-cpp` (or a tiny local test-only GGUF); can't run against real HF downloads in a sandboxed/CI environment.
- [ ] Tests for `report.ts` — pending its real implementation.
- [ ] Integration test for the full CLI pipeline end-to-end (currently only unit-level; no test drives `cli.ts`'s `action()` itself).
- Current total: 18 tests, all passing (verified in-sandbox; last cross-check on the maintainer's machine was at 17, before the regression test was added — re-verify there too).

## Docs / project hygiene

- [ ] README.md — not created yet. Needs the "what this is / isn't" framing from INTENT.md plus a working one-liner example.
- [x] Project name: `at-field` — checked clean on npm + PyPI (404 = available), no meaningful GitHub collision.
- [x] License: MIT — `LICENSE` file added, `package.json` `license` field synced.
- [ ] Demo / GitHub-page audio set — deferred by explicit request. Sourcing research already done (Spoken Wikipedia for "obvious theme" cases, LibriVox for "hidden theme" cases, both EN/FR) — see chat history, not yet written anywhere durable in the repo.

## Open decisions (need an explicit answer, not an assumed default)

- Exact `--max-duration` default value — a candidate (60 min) was floated, never confirmed.
- Language-flag behavior when transcript language and theme-expansion language differ (e.g. French audio, English `--theme`).
- Default output filename/path convention — or whether v1 only prints to stdout and never writes a file.
