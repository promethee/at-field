# TODO.md

Status: full pipeline wired end-to-end (transcribe → theme/lexic → analyze →
report → files written to disk), all stages implemented, duration cap,
explicit segment range, language-mismatch checks, and implicit transcript
reuse all enforced, 89/89 tests passing, typecheck clean. Nothing known
broken. README written. Remaining v1 gap is the demo GIF.

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
- [x] A relative audio path (e.g. typed from the user's own cwd, not the
  repo) broke transcription with a confusing `input file not found
  '<name>.wav'` from whisper-cli.exe itself. Root cause: `nodejs-whisper`
  `cd`s into its own install directory before invoking whisper-cli, so a
  relative path silently resolves against the wrong directory once
  whisper.cpp's own wav conversion runs. Found via real `npx` tarball
  testing on a second machine, not caught by any existing test (all
  existing tests use paths already resolved relative to the repo). Fixed
  in `src/cli.ts` by resolving the audio argument to absolute
  (`path.resolve`) as the very first thing the action handler does.

## v1 scope — transcription pipeline

- [x] Audio input handling: any common format, conversion delegated to `nodejs-whisper` (ffmpeg internally). File: `src/transcribe.ts`.
- [x] Local Whisper integration (`nodejs-whisper`, wraps whisper.cpp) — model download, cache check, inference. File: `src/transcribe.ts`. Tested: `isModelCached()` only (mocked `fs`) — `transcribe()` itself untested, needs real audio+model.
- [x] Segment-level timestamps. `transcribe()` no longer requests plain-text-only output; `parseWhisperOutput()` parses whisper.cpp's default timestamped stdout (`[HH:MM:SS.mmm --> HH:MM:SS.mmm] text`) into `TranscriptSegment[]` (`src/types.ts`). Tested: 5 cases in `src/transcribe.test.ts` (basic extraction, text joining, hour-scale timestamps, blank/non-segment lines ignored, no-match input).
- [x] `--whisper-model=tiny|base|small|medium|large` flag, default via preset. File: `src/cli.ts`.
- [x] First-run download-size confirm, skipped if model already cached. File: `src/confirm.ts` + wired in `src/cli.ts`. Untested (interactive prompt, no test harness for it yet).
- [x] `--preset fast|balanced|best` — bundles whisper-model + max-duration + theme-mode defaults. File: `src/presets.ts`. Tested: `src/presets.test.ts`. `best` triggers the upfront confirm in `cli.ts`.
- [x] Per-run transcript-quality disclaimer, always shown. Printed in `src/cli.ts` after transcription, and also included in `report.ts`'s Markdown output. One fixed message for the only v1 source (`model`).
- [x] `--language` flag: **implemented.**
  - `--language <code>` set explicitly: checked first, before any confirm gates (free/instant — shouldn't come after a model-download prompt). Detects `--theme`'s language (`src/language.ts::detectLanguageCode`, franc-min + iso-639-3 code mapping) and compares to `<code>`. Mismatch → hard stop via `program.error`. Ambiguous (common for short `--theme` strings) → warn, proceed.
  - `--language auto` (default): checked after transcription. Required fixing a real gap in `transcribe.ts` — `nodejs-whisper`'s return value never contained Whisper's actual auto-detected language (whisper.cpp writes it to stderr, which the library only forwards to a custom `logger.debug()`, not the resolved promise); `TranscriptResult.language` was silently echoing back the *requested* string ("auto") instead. Fixed by passing a capturing logger and parsing the `auto-detected language: en (p = 0.99)` line (`src/language.ts::extractWhisperDetectedLanguage`). On mismatch: transcript file is now written *before* this check (moved up in `cli.ts` specifically so the stop message's "already on disk" claim is true), then the run exits before analysis/report. On ambiguous: warn, proceed.
  - Language-detection library: `franc-min` (short strings often return `und`/unconfident — by design, not a bug) + `iso-639-3`'s `iso6393To1` map to compare against Whisper's 2-letter codes.
  - Tested: 9 cases in `src/language.test.ts`. Not tested: the auto-mode path end-to-end (needs real Whisper + real mismatched audio/theme — same sandbox limitation as `expandTheme()`/`transcribe()`). Smoke-tested manually: explicit-mismatch hard-stops correctly and *before* the model-download confirm (fixed an ordering bug found while implementing — the check originally ran after confirm gates); explicit-match correctly proceeds.
  - Known gap: `language.ts` branch coverage 93.33% (one path — a real detected language with no ISO 639-1 equivalent — not reproduced with real sample text after reasonable effort; same class as `audio.ts`'s one gap, not chased further).

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
- [x] `--start <time>`/`--end <time>` explicit range flags. Accepts plain
  seconds, `MM:SS`, or `HH:MM:SS` (`src/audio.ts::parseTimeToSeconds`).
  Extraction (`src/audio.ts::trimToRange`) runs before transcription and
  before the duration cap, independent of `--max-duration` — the cap then
  applies to the extracted range's own duration, not the original file's.
  `--start` at/past the audio's duration, or `--end` at/before `--start`,
  errors out before any confirm gates (`src/cli.ts`). Whisper's
  clip-relative segment timestamps are offset back to the original audio's
  timeline (`src/cli.ts`) so timestamped occurrences stay meaningful.
  Disclosed in both `cli.ts`'s printed output and `report.ts`'s Markdown
  (`TranscriptResult.segmentRange`, `src/types.ts`). Ignored (with a
  printed note) when reusing an existing transcript, since transcription
  itself is skipped in that path. Tested: 8 cases in `src/audio.test.ts`
  (`parseTimeToSeconds` valid/invalid, `trimToRange` disabled/extract/
  start-only/end-clamping/validation errors) + 3 cases in
  `src/report.test.ts` (disclaimer with explicit end, "end of audio"
  fallback, omitted when null).

## v1 scope — output

- [x] `src/report.ts::renderMarkdown` — full report: title, obviousness score + interpretation, disclaimers (transcript quality + thin-field), summary table (term/count), timestamped occurrence log, full lexical field, transcript section (link/pointer only, text never embedded — see note below). Section order is fastest-to-slowest to read, per design discussion. Tested: 7 cases in `src/report.test.ts`.
- [x] `src/report.ts::renderTerminalGraphic` — plain-ASCII obviousness gauge + top-10 bar chart of matches, no chart dependency. Tested: 2 cases in `src/report.test.ts`.
- [x] `cli.ts` wired to call both and print them — confirmed via typecheck + full suite; **not yet run against real audio** (blocked on the same untestable-in-sandbox model downloads as `transcribe()`/`expandTheme()`).
- [x] Output files written to disk. Convention: same directory as input audio, `<audio-basename>.<theme-slug>.<short-uuid>.md` + matching `.transcript.txt`. UUID suffix guarantees no collision (including same-day reruns on the same audio+theme) without a date prefix — file mtime already carries recency. File: `src/output.ts::buildOutputPaths`. `report.ts`'s Transcript section now links the real filename via `RenderOptions.transcriptFileName` instead of a generic placeholder line. Tested: 5 cases in `src/output.test.ts` + 2 cases in `report.test.ts` (real filename vs. fallback). Smoke-tested end-to-end (no Whisper needed — fed synthetic data directly) confirming files are written and the report correctly cross-references the transcript file.
- [x] **Implicit transcript-artifact reuse.** Before any Whisper-related confirm gates or transcription, glob the audio's directory for an existing `<audio-basename>.<theme-slug>.*.transcript.txt` (`src/output.ts::findExistingTranscript`, most-recently-modified wins if several match). If found, an interactive confirm (default yes) offers to reuse it — accepting skips the `--preset best`/model-download confirms and transcription entirely, not just the transcribe call. Disclosure printed on reuse: no saved segment timestamps (timestamped occurrences will be empty) or language metadata (auto-mode language-mismatch check is skipped that run). The report references the *original* reused filename rather than duplicating the file under a new name. No new flag — reads back a file the tool's own output convention already produces. Tested: 5 cases in `src/output.test.ts` (found/not-found, wrong-theme ignored, most-recent-wins, unreadable-directory). Smoke-tested end-to-end with a real CLI invocation and a manually-planted transcript file — confirmed it skips straight past all Whisper setup to theme expansion, no model-download prompt at all.

## Decided, not yet started

- [ ] **Swap `nodejs-whisper` for `@huggingface/transformers` (ONNX + WASM Whisper).** Decided by the maintainer after `nodejs-whisper`'s on-demand whisper.cpp build (CMake + a C++ compiler, no prebuilt binaries) proved to fail for real on a second test machine — a genuine upstream `ggml-cpu.c`/MinGW-w64-headers incompatibility (`THREAD_POWER_THROTTLING_STATE` undeclared), not something in our control to fix or worth chasing per-machine. `@huggingface/transformers` needs no native compile step on the user's machine (its Node backend, `onnxruntime-node`, ships prebuilt native binaries per platform via a normal `npm install`), removing this whole failure class. Explicitly decided *without* a before/after speed benchmark — expected somewhat slower than native-compiled whisper.cpp (rough estimate 1.2-2x, unverified), accepted as the tradeoff for reliability across machines. Scope: replace the dependency; rewrite `src/transcribe.ts` (new inference API, re-derive segment timestamps from its output format, different model-cache mechanism than `isModelCached()`'s current file-existence check); update `src/transcribe.test.ts` and anything relying on Whisper's own auto-detected-language stderr line (`src/language.ts::extractWhisperDetectedLanguage`, since that whisper.cpp-specific mechanism goes away). Not started.

## v2 backlog (not started, gated on real feedback — see condition below)

- [ ] **Meaningful obviousness bands.** Current `--obviousness-steps` gives even, unlabeled bands (see INTENT.md) specifically because no real score distribution exists yet to justify semantic labels or uneven cutoffs. Do not revisit this by guessing a better default — only act on it if real usage (GitHub issues/PRs from actual users running the tool on their own audio) asks for it, ideally with example scores attached. Until then, even-steps stays as-is.
- [ ] **Stage-transition terminal disclosure.** Raised directly by the maintainer (not gated on external feedback like the item above) as a UX mitigation for slow runs on weak hardware: print a line at each pipeline stage transition (range extraction, duration-cap trim, transcription start incl. model + estimated audio-length-based duration, theme expansion, analysis) instead of one line before a long silent wait. Fits the project's existing "disclosure, not gatekeeping" philosophy (see INTENT.md). Explicitly *not* a live progress bar — stays at stage-transition granularity to avoid clashing with the tool's minimal-output stance. Not started.
- [ ] **Surface nodejs-whisper's captured debug log on transcription failure.** Found while diagnosing a real "whisper-cli executable not found" error on a second test machine (nodejs-whisper compiles whisper.cpp on first use via CMake; a silent build failure there surfaces as this bare, undiagnosable message instead). `src/transcribe.ts`'s `captureLogger` already collects nodejs-whisper's debug lines (build steps, exit codes) for language detection, but discards them when `nodewhisper()` throws. Printing them on failure would turn an opaque error into an actionable one. Not started.

## Explicitly deferred / out of scope for v1

- Theme-discovery mode (no `--theme` given) — rejected, see INTENT.md.
- Subject→topic promotion logic — rejected, see INTENT.md.
- Downloadable/linked sample audio on the GitHub page — would have needed sourcing a properly licensed demo file (Spoken Wikipedia, LibriVox were candidates); dropped as unnecessary, not worth the licensing legwork.
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
- [x] `src/report.test.ts` — Markdown + terminal graphic rendering, including `computeObviousnessStep` unit tests (even division, boundary at score 1.0, arbitrary step counts, invalid input), duration-cap disclaimer (present/absent), segment-range disclaimer (explicit end/"end of audio" fallback/absent), real-vs-fallback transcript filename reference, and branch coverage for empty matches/segmentHits/field, hour-scale timestamps, and empty-matches terminal graphic = 27 tests. 100/100/100 coverage.
- [x] `src/audio.test.ts` — duration probing/trimming plus `--start`/`--end` range parsing and extraction, using **real ffmpeg/ffprobe** against a generated test tone (no mocking) = 15 tests (7 duration-cap + 3 `parseTimeToSeconds` + 5 `trimToRange`). One contrived-only gap carried over from before: ffprobe succeeding but returning unparseable output — not chased, same class as other real-I/O gaps below.
- [x] `src/output.test.ts` — filename generation: same-directory convention, slugification, stem pairing, no-collision across calls, empty-theme fallback = 5 tests. 100/100/100 coverage.
- [x] `src/language.test.ts` — language detection confidence (clear EN/FR sentences vs. short ambiguous strings), match/mismatch/ambiguous outcomes, and whisper.cpp log-line parsing (including case-insensitivity) = 9 tests. 100% line, 93.33% branch (one gap: a real detected language with no ISO 639-1 equivalent — not reproduced with real sample text after reasonable effort, same class as `audio.ts`'s gap).
- [x] `src/output.test.ts` (extended) — `findExistingTranscript`: found/not-found, wrong-theme ignored, most-recently-modified wins among several matches, unreadable-directory fallback. 100/100/100 coverage maintained.
- [ ] Tests for `expandTheme()` — needs a mocking strategy for `node-llama-cpp` (or a tiny local test-only GGUF); can't run against real HF downloads in a sandboxed/CI environment.
- [ ] Integration test driving `cli.ts`'s `action()` end-to-end (currently unit-level only, per module). The language-mismatch flow was smoke-tested manually instead (see the item above) — a real integration test would cover this properly.
- Current total: **89 tests, all passing** (verified in-sandbox as of this update; re-verify on the maintainer's machine before trusting the count). Remaining coverage gaps are `theme.ts` (67.59%) and `transcribe.ts` (84.13%) — both are the real-model-I/O functions (`expandTheme`, `isThemeModelCached`, `transcribe`) that can't be unit-tested without a live model; not a gap to close with more unit tests.

## Docs / project hygiene

- [x] `README.md` — written. Opener/philosophy/non-goals distilled from INTENT.md (wording reviewed and revised point-by-point in chat, not copied verbatim — e.g. dropped the named-competitor comparison as overclaiming for a portfolio project). Sections: opener + one-liner example, why the obviousness score, install (Node 20+/ffmpeg prereq), flags table, philosophy, what-this-isn't, known limitations (language mismatch, thin-field), license, "made with AI, designed by human". No demo GIF yet (see item below).
- [x] Project name: `at-field` — checked clean on npm + PyPI, no meaningful GitHub collision.
- [x] License: MIT — `LICENSE` file added, `package.json` `license` field synced.
- [ ] Simulated-usage demo GIF for the README — explicitly a fabricated/scripted terminal session (canned example output matching `renderTerminalGraphic`'s format), not a real recording against real audio/model. Attempted via puppeteer (node-canvas failed: no prebuilt binary for the sandbox's Node version, no native toolchain to build it) in a scratch dir, not committed. Abandoned mid-debug this session ("done later") — puppeteer + Chromium download did work by the end, next attempt can resume from there instead of re-evaluating canvas.

## Open decisions (need an explicit answer, not an assumed default)

None currently open. (`--max-duration` defaults confirmed: `fast`=60min, `balanced`=120min, `best`=0/unlimited — see `src/presets.ts`.)
