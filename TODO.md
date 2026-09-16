# TODO.md

Status: full pipeline wired end-to-end (transcribe → theme/lexic → analyze →
report), all stages implemented, duration cap now enforced, 56/56 tests
passing, typecheck clean. Nothing known broken. Remaining v1 gaps are
explicit segment range flags, output-file writing, README, and the
deferred demo set.

How to use this file: every `[x]` must have a file reference and an
acceptance criterion (what specifically makes it true) — not just "done".
If you (Claude) mark something `[x]` without both, that's a process
violation — stop and fix the checklist entry, don't just fix the code.

## Fixed defects (history — kept for context, not action items)

- [x] `--lexic` used to silently break `--theme`'s role as the analysis
  anchor (`loadLexicFile` derived `theme` from the wordlist's filename).
  Fixed: `--theme` is now required in all cases; `loadLexicFile(filePath,
  theme)` takes theme as a parameter. Regression test added in
  `src/theme.test.ts`.
- [x] `parseWhisperOutput`'s segment regex used `\s*` before the text
  capture, which crossed newlines (since `\s` matches line breaks) and
  bled one segment's captured text into the next line's content. Fixed by
  matching line-by-line instead of with one multi-line regex. Caught by
  `src/transcribe.test.ts::"parseWhisperOutput ignores non-segment lines
  and empty segments"` before being shipped as "done".

## v1 scope — transcription pipeline

- [x] Audio input handling: any common format, conversion delegated to `nodejs-whisper` (ffmpeg internally). File: `src/transcribe.ts`.
- [x] Local Whisper integration (`nodejs-whisper`, wraps whisper.cpp) — model download, cache check, inference. File: `src/transcribe.ts`. Tested: `isModelCached()` only (mocked `fs`) — `transcribe()` itself untested, needs real audio+model.
- [x] Segment-level timestamps. `transcribe()` no longer requests plain-text-only output; `parseWhisperOutput()` parses whisper.cpp's default timestamped stdout (`[HH:MM:SS.mmm --> HH:MM:SS.mmm] text`) into `TranscriptSegment[]` (`src/types.ts`). Tested: 5 cases in `src/transcribe.test.ts` (basic extraction, text joining, hour-scale timestamps, blank/non-segment lines ignored, no-match input).
- [x] `--whisper-model=tiny|base|small|medium|large` flag, default via preset. File: `src/cli.ts`.
- [x] First-run download-size confirm, skipped if model already cached. File: `src/confirm.ts` + wired in `src/cli.ts`. Untested (interactive prompt, no test harness for it yet).
- [x] `--preset fast|balanced|best` — bundles whisper-model + max-duration + theme-mode defaults. File: `src/presets.ts`. Tested: `src/presets.test.ts`. `best` triggers the upfront confirm in `cli.ts`.
- [x] Per-run transcript-quality disclaimer, always shown. Printed in `src/cli.ts` after transcription, and also included in `report.ts`'s Markdown output. One fixed message for the only v1 source (`model`).
- [ ] `--language` flag(s) — flag exists in `cli.ts` and is passed through to `transcribe()`, but "default auto-detect, explicit override" behavior is not verified end-to-end, and interaction with theme-expansion language (see Open decisions) is undecided.

## v1 scope — theme / lexical analysis

- [x] `--theme "<value>"` flag, required in all cases. File: `src/cli.ts`.
- [x] Local LLM-based dynamic lexical-field expansion. File: `src/theme.ts::expandTheme` (`node-llama-cpp`, in-process, JSON-schema-constrained output). **Untested end-to-end** — Hugging Face model download is outside this sandbox's allowed network; verify on your machine.
- [x] `--lexic words.txt` — static wordlist override, `--theme` still the analysis anchor. File: `src/theme.ts::loadLexicFile(filePath, theme)`. Tested in `src/theme.test.ts`.
- [x] Thin-field detection: fixed threshold (< 8 terms), applied to both paths, exposed as `LexicalFieldResult.isThin`. Surfaced in both `cli.ts`'s printed disclaimer and `report.ts`'s Markdown. Tested for the static path; dynamic path untested (same model caveat as above).
- [x] Obviousness score computation — `literalThemeMatches / totalFieldMatches`, 0 matches → score 0. File: `src/analyze.ts`. Tested: 6 cases in `src/analyze.test.ts`.
- [x] Obviousness score *interpretation* — no semantic labels; `--obviousness-steps <n>` (default 2) divides the score into even bands, reported as `step X/N (band: A%–B%)`. File: `src/report.ts::computeObviousnessStep`, wired via `--obviousness-steps` in `src/cli.ts`. Tested: 5 cases in `src/report.test.ts`. See INTENT.md for why semantic bands (30/70, quartiles, single threshold) were all rejected as unconfirmed guesses.
- [x] Timestamped occurrence log — one entry per transcript segment containing ≥1 field-term hit, bracketed by Whisper's own segment boundaries (no invented merge-window). File: `src/analyze.ts::computeSegmentHits`, type `SegmentHit` in `src/types.ts`. Tested: 3 cases in `src/analyze.test.ts` (single hit, multiple terms in one segment, empty when no segments).
- [x] Output shape: `obviousnessScore`, `matches: {term,count}[]`, `segmentHits: {start,end,terms}[]` on `AnalysisResult` (`src/types.ts`).

## v1 scope — segment / duration handling

- [x] `--max-duration=<minutes>` flag — now enforced. Audio is trimmed via ffmpeg **before** transcription (not after), so a capped run doesn't pay transcription cost for the discarded portion. Files: `src/audio.ts::trimToMaxDuration` (trim), `src/cli.ts` (wiring). Tested: 7 cases in `src/audio.test.ts`, using real ffmpeg/ffprobe against a generated test tone (not mocked).
- [x] `--max-duration=0` disables the cap — no probing, no trimming, original file used as-is. Tested.
- [x] Duration-cap disclosure — printed in `cli.ts` when trimming actually occurs, and included in `report.ts`'s Markdown Disclaimers section (`TranscriptResult.durationCap`, `src/types.ts`). Both paths tested (`src/report.test.ts` for the Markdown line).
- [ ] `--start`/`--end` or `--segment=00:00-30:00` explicit range flags — not implemented. Separate from the max-duration cap; not attempted this pass.

## v1 scope — output

- [x] `src/report.ts::renderMarkdown` — full report: title, obviousness score + interpretation, disclaimers (transcript quality + thin-field), summary table (term/count), timestamped occurrence log, full lexical field, transcript section (link/pointer only, text never embedded — see note below). Section order is fastest-to-slowest to read, per design discussion. Tested: 7 cases in `src/report.test.ts`.
- [x] `src/report.ts::renderTerminalGraphic` — plain-ASCII obviousness gauge + top-10 bar chart of matches, no chart dependency. Tested: 2 cases in `src/report.test.ts`.
- [x] `cli.ts` wired to call both and print them — confirmed via typecheck + full suite; **not yet run against real audio** (blocked on the same untestable-in-sandbox model downloads as `transcribe()`/`expandTheme()`).
- [ ] The Markdown report's "Transcript" section currently just says "see the separate transcript file" — **that file doesn't exist yet.** `cli.ts` only prints to stdout; nothing is written to disk. This is directly tied to the open "default output filename/path convention" decision below — not done until that's resolved and implemented.

## v2 backlog (not started, gated on real feedback — see condition below)

- [ ] **Meaningful obviousness bands.** Current `--obviousness-steps` gives even, unlabeled bands (see INTENT.md) specifically because no real score distribution exists yet to justify semantic labels or uneven cutoffs. Do not revisit this by guessing a better default — only act on it if real usage (GitHub issues/PRs from actual users running the tool on their own audio) asks for it, ideally with example scores attached. Until then, even-steps stays as-is.

## Explicitly deferred / out of scope for v1

- Theme-discovery mode (no `--theme` given) — rejected, see INTENT.md.
- Subject→topic promotion logic — rejected, see INTENT.md.
- Non-Markdown output formats (JSON, HTML, PDF).
- Hosted/API-based transcription or theme-expansion fallback.
- Multi-transcript / batch processing.
- Persistent project/workspace state (ThemeForge-style).

## Testing

- [x] Test runner: `node:test` (built-in, zero deps — chosen over vitest).
- [x] `npm test` / `npm run test:watch` / `npm run test:coverage` scripts.
- [x] `src/presets.test.ts` — 3 tests.
- [x] `src/transcribe.test.ts` — `isModelCached()` (3) + `parseWhisperOutput()` (5) = 8 tests.
- [x] `src/theme.test.ts` — `loadLexicFile()`, incl. theme/lexic regression test = 6 tests.
- [x] `src/analyze.test.ts` — obviousness score, matching, segmentHits = 9 tests.
- [x] `src/report.test.ts` — Markdown + terminal graphic rendering, including `computeObviousnessStep` unit tests (even division, boundary at score 1.0, arbitrary step counts, invalid input), duration-cap disclaimer (present/absent), and branch coverage for empty matches/segmentHits/field, hour-scale timestamps, and empty-matches terminal graphic = 22 tests. 100/100/100 coverage.
- [x] `src/audio.test.ts` — duration probing and trimming, using **real ffmpeg/ffprobe** against a generated test tone (no mocking) = 7 tests. 100% line, 92.86% branch (one contrived-only gap: ffprobe succeeding but returning unparseable output — not chased, same class as other real-I/O gaps below).
- [ ] Tests for `expandTheme()` — needs a mocking strategy for `node-llama-cpp` (or a tiny local test-only GGUF); can't run against real HF downloads in a sandboxed/CI environment.
- [ ] Integration test driving `cli.ts`'s `action()` end-to-end (currently unit-level only, per module).
- Current total: **56 tests, all passing** (verified in-sandbox as of this update; re-verify on the maintainer's machine before trusting the count). Remaining coverage gaps are `theme.ts` (67.59%) and `transcribe.ts` (90.57%) — both are the real-model-I/O functions (`expandTheme`, `isThemeModelCached`, `transcribe`) that can't be unit-tested without a live model; not a gap to close with more unit tests.

## Docs / project hygiene

- [ ] README.md — not created yet. Needs the "what this is / isn't" framing from INTENT.md plus a working one-liner example.
- [x] Project name: `at-field` — checked clean on npm + PyPI, no meaningful GitHub collision.
- [x] License: MIT — `LICENSE` file added, `package.json` `license` field synced.
- [ ] Demo / GitHub-page audio set — deferred by explicit request. Sourcing research done (Spoken Wikipedia, LibriVox, EN/FR) — see chat history, not yet written anywhere durable in the repo.

## Open decisions (need an explicit answer, not an assumed default)

- `--max-duration` **default values** per preset (currently `fast`=60min, `balanced`=120min, `best`=0/unlimited, set in `src/presets.ts`) — these were candidate placeholders floated early on, never separately confirmed. Enforcement mechanism is now built and correct regardless of what the numbers end up being; only the specific minute values are unconfirmed.
- Language-flag behavior when transcript language and theme-expansion language differ (e.g. French audio, English `--theme`).
- Default output filename/path convention — including whether the transcript gets written to its own file (the Markdown report already assumes this exists and links to it) or v1 only prints to stdout.
