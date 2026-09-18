# TODO.md

Status: full pipeline wired end-to-end (transcribe → theme/lexic → analyze →
report → files written to disk), all stages implemented, duration cap,
explicit segment range, language-mismatch checks, and implicit transcript
reuse all enforced, 84/84 tests passing, typecheck clean. Whisper backend
swapped from `nodejs-whisper` to `@fugood/whisper.node` — see INTENT.md for
the full rationale. Smoke-tested end-to-end for real this session (real
model download, real transcription, real report) — first time the full
pipeline has actually been verified against real audio, not just unit
tests. Nothing known broken. README written. Stage-transition terminal
disclosure and confirm-instead-of-hard-stop explicit-language mismatch
both built and smoke-tested for real. Transcript file format changed to
timestamped per-segment lines (was one unreadable long string). Remaining
v1 gap: the demo GIF.

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
  and empty segments"` before being shipped as "done". (`parseWhisperOutput`
  itself no longer exists — removed in the whisper-backend swap, since the
  new backend returns structured segments directly. Kept here as history.)
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

- [x] Audio input handling: any common format. `@fugood/whisper.node`'s bundled `miniaudio` decoder reads mp3/wav/flac/etc. directly — no ffmpeg pre-conversion step for transcription itself (ffmpeg remains required for `--start`/`--end`/`--max-duration`, see `src/audio.ts`). File: `src/transcribe.ts`. Confirmed via a live test this session (mp3 fed straight to `transcribeFile`, correct output).
- [x] Local Whisper integration via `@fugood/whisper.node` (prebuilt native whisper.cpp bindings, no local compile step) — model download, cache check, inference. File: `src/transcribe.ts`. Model weights cached at `~/.cache/at-field/whisper-models/` (user-level, independent of install method), downloaded from `huggingface.co/ggerganov/whisper.cpp`. Tested: `isModelCached()` (3 cases, mocked `fs`). `transcribe()` itself: **smoke-tested for real this session** — real model download, real transcription of a real audio sample, correct output — not just a sandbox limitation caveat anymore, though still no automated test (needs a real model, same class as `expandTheme()` below).
- [x] Segment-level timestamps. `@fugood/whisper.node`'s `transcribeFile()` returns structured `segments: [{text, t0, t1}]` (milliseconds) directly — mapped to `TranscriptSegment[]` (seconds) in `src/transcribe.ts`. No more stdout parsing (the old `parseWhisperOutput()` and its 5 tests were removed entirely — the new backend doesn't need it).
- [x] `--whisper-model=tiny|base|small|medium|large` flag, default via preset. File: `src/cli.ts`. `large` maps to the current `ggml-large-v3.bin` release.
- [x] First-run download-size confirm, skipped if model already cached. File: `src/confirm.ts` (sizes updated to the real `ggerganov/whisper.cpp` GGML file sizes) + wired in `src/cli.ts`. Untested (interactive prompt, no test harness for it yet).
- [x] `--preset fast|balanced|best` — bundles whisper-model + max-duration + theme-mode defaults. File: `src/presets.ts`. Tested: `src/presets.test.ts`. `best` triggers the upfront confirm in `cli.ts`.
- [x] Per-run transcript-quality disclaimer, always shown. Printed in `src/cli.ts` after transcription, and also included in `report.ts`'s Markdown output. One fixed message for the only v1 source (`model`).
- [x] `--language` flag: **implemented.**
  - `--language <code>` set explicitly: checked first, before any confirm gates (free/instant — shouldn't come after a model-download prompt). Detects `--theme`'s language (`src/language.ts::detectLanguageCode`, franc-min + iso-639-3 code mapping) and compares to `<code>`. **Mismatch behavior changed this session**: no longer a hard `program.error` stop — discloses both the theme's detected language and the set `--language`, suggests trying a longer phrase or a synonym (since `franc-min` can confidently misdetect short/unusual themes, see the false-positive item below), and asks "Continue anyway?" via `confirm()` (default no). Saying no aborts (exit 1); yes proceeds normally. Ambiguous (common for short `--theme` strings) → warn, proceed (unchanged). Auto-mode's post-transcription mismatch check (below) was deliberately **not** changed to confirm-and-continue in this pass — scoped to explicit `--language` only, at the maintainer's request.
  - `--language auto` (default): checked after transcription. `TranscriptResult.language` now comes directly from `@fugood/whisper.node`'s structured output (real whisper.cpp auto-detection, confirmed working via a live test — English audio correctly returned `language: "en"` with no language hint passed) — no more stderr-log-scraping (the old `extractWhisperDetectedLanguage()` and its 3 tests were removed, see INTENT.md for the nodejs-whisper-era history this replaced). On mismatch: transcript file is now written *before* this check (moved up in `cli.ts` specifically so the stop message's "already on disk" claim is true), then the run exits before analysis/report. On ambiguous: warn, proceed. **Message refined this session**: now explicitly points to retrying with `--language=<detected>` set explicitly, since that path just became "confirm past a false positive" instead of a hard stop — a real, different escape hatch, not just rephrased advice (setting `--language` doesn't itself avoid `franc-min`'s theme misdetection, but it does downgrade the consequence from a block to a confirm).
  - Language-detection library: `franc-min` (short strings often return `und`/unconfident — by design, not a bug) + `iso-639-3`'s `iso6393To1` map to compare against Whisper's 2-letter codes.
  - Tested: 6 cases in `src/language.test.ts` (unit tests for `checkLanguageMatch`/`detectLanguageCode` themselves unaffected — the confirm-vs-hard-stop change is `cli.ts` behavior, not covered by these). Smoke-tested for real this session: a real auto-mode mismatch and match (full report produced), and the new explicit-`--language` confirm's both branches (answering no aborts with exit 1 and the correct message; answering yes proceeds to the next stage).
  - **New gap found via real testing (not present in prior unit-test-only coverage):** `franc-min` can *confidently* misdetect short/unusual `--theme` phrases as the wrong language, not just return low-confidence "ambiguous" — e.g. `"american patriotism"` → detected as Indonesian, `"patriotism"` alone → Tagalog. Tested: longer, more sentence-like phrases (e.g. `"freedom and country"`) detect correctly. Not a crash/data-loss risk (`--language` explicit bypasses it), but a real false-positive-block risk. Disclosed in README's Known Limitations. Not fixed here — improving `franc-min`'s short-text accuracy is out of scope for this change. **Confirmed via direct testing: forcing single-word themes would make this worse, not better** (a single word detected *less* reliably than a 3+ word phrase in every case tried).
  - Known gap: `language.ts` branch coverage not re-measured after removing `extractWhisperDetectedLanguage()` — expect it to be at or near 100% now that the untested ISO-639-1-mapping edge case in the removed function is gone; not re-run this session.

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
- [x] `cli.ts` wired to call both and print them — confirmed via typecheck + full suite, **and now run against real audio this session** (real model, real transcription, real Markdown + terminal report, correct output). `expandTheme()` remains the one piece still untested end-to-end (separate model, separate download path).
- [x] Output files written to disk. Convention: same directory as input audio, `<audio-basename>.<theme-slug>.<short-uuid>.md` + matching `.transcript.txt`. UUID suffix guarantees no collision (including same-day reruns on the same audio+theme) without a date prefix — file mtime already carries recency. File: `src/output.ts::buildOutputPaths`. `report.ts`'s Transcript section now links the real filename via `RenderOptions.transcriptFileName` instead of a generic placeholder line. Tested: 5 cases in `src/output.test.ts` + 2 cases in `report.test.ts` (real filename vs. fallback). Smoke-tested end-to-end (no Whisper needed — fed synthetic data directly) confirming files are written and the report correctly cross-references the transcript file.
- [x] **`.transcript.txt` format changed from one long space-joined string to one timestamped line per Whisper segment.** Found via real testing: a single unbroken paragraph reads fine for an 11-second test clip but is unreadable for anything podcast-length. New format: `[HH:MM:SS–HH:MM:SS] segment text`, one per line — also lets a match from the report's timestamped occurrence log be found directly in the transcript. File: `src/report.ts::renderTranscriptText`, wired in `src/cli.ts` (replaces writing `transcript.text` directly). Tested: 3 cases in `src/report.test.ts` (multi-segment formatting, hour-scale timestamps, empty-segments case).
- [x] **`package.json` `files` allowlist added (`["dist"]`).** Found by accident: two audio test files got copied into the project root during this session (a `SendUserFile` side effect) and `npm pack` swept them straight into the tarball with no allowlist to stop it (9 MB instead of ~60 kB, published from whatever happened to be sitting in the directory). `.gitignore` alone doesn't protect `npm pack`/`npm publish` — it needs its own `files` field. Verified via `npm pack --dry-run`: tarball is back to only `dist/` + `package.json`/`README.md`/`LICENSE` (npm always includes those three regardless), 23.0 kB, 22 files. `*.tgz` also added to `.gitignore` (it's a local test-build artifact, was previously untracked with no ignore rule). Not otherwise trimmed further (`dist/*.test.js` still ships) — out of scope for this fix, which was specifically about preventing stray non-repo files from leaking in.
- [x] **Implicit transcript-artifact reuse.** Before any Whisper-related confirm gates or transcription, glob the audio's directory for an existing `<audio-basename>.<theme-slug>.*.transcript.txt` (`src/output.ts::findExistingTranscript`, most-recently-modified wins if several match). If found, an interactive confirm (default yes) offers to reuse it — accepting skips the `--preset best`/model-download confirms and transcription entirely, not just the transcribe call. Disclosure printed on reuse: no saved segment timestamps (timestamped occurrences will be empty) or language metadata (auto-mode language-mismatch check is skipped that run). The report references the *original* reused filename rather than duplicating the file under a new name. No new flag — reads back a file the tool's own output convention already produces. Tested: 5 cases in `src/output.test.ts` (found/not-found, wrong-theme ignored, most-recent-wins, unreadable-directory). Smoke-tested end-to-end with a real CLI invocation and a manually-planted transcript file — confirmed it skips straight past all Whisper setup to theme expansion, no model-download prompt at all.

## Done this session

- [x] **Swapped `nodejs-whisper` for `@fugood/whisper.node`.** Full rationale, rejected alternatives (`@huggingface/transformers` — no real language auto-detection; `@remotion/install-whisper-cpp` — license scoped to "creating videos and images", not this use case), and the unresolved real-hardware-speed caveat are all in INTENT.md's "Whisper backend" section — not duplicated here. Scope actually touched: `src/transcribe.ts` (full rewrite), `src/confirm.ts` (model sizes), `src/language.ts` (removed `extractWhisperDetectedLanguage`), `src/cli.ts` (comment fix only, logic unchanged at that point), `.gitignore` (removed now-dead nodejs-whisper-specific line), `package.json`. Typecheck clean, 81/81 tests passing, and — unlike the prior model-dependent code — actually smoke-tested end-to-end for real (real model download, real transcription, real report) rather than left as a sandbox-limitation caveat.
- [ ] **Verify real-hardware transcription speed.** The migration's one open question: this sandbox took 250–335s to transcribe an 11-second clip regardless of thread count, ~15-20x slower than the rejected ONNX backend in the same sandbox — suspected sandbox-specific (CPU-feature-detection/SIMD fallback), not necessarily real. Not verified on actual hardware. If real-machine testing shows this is genuinely that slow (not a sandbox artifact), this backend choice should be revisited.
- [x] **Stage-transition terminal disclosure.** Moved out of the v2 backlog into done — implemented right after the whisper-backend swap, in the same session. Three concrete additions to `src/cli.ts`: (1) the whisper-model download (when the confirm gate says yes) now runs via an explicitly-exported `ensureModelDownloaded()` (`src/transcribe.ts`) called from `cli.ts` with its own "Downloading whisper model..." message, instead of silently happening inside `transcribe()` after the "Transcribing..." line was already printed — a real, previously-silent multi-GB-download gap, not just a cosmetic reorder; (2) the transcription-start message now states the actual audio duration being transcribed (`Transcribing 0.2 min of audio with model "tiny"...`) — a known fact, not a time estimate, confirmed by design discussion that a guessed ETA risks being visibly wrong and eroding trust more than no estimate; (3) a "Expanding theme ... into a lexical field..." message before the dynamic (`--lexic`-less) theme-expansion path only — skipped for `--lexic`, since a file read is effectively instant and doesn't need a stage message. Analysis itself (also listed in the original ask) was deliberately left without a stage message — it's synchronous and near-instant, not a silent wait. Smoke-tested for real: confirmed the duration message renders correctly (`Transcribing 0.2 min of audio...`) in a fresh (non-reused) run. Typecheck clean, 81/81 tests passing (no new tests added — these are `console.log` side effects in `cli.ts`'s `action()`, same untested-interactive-flow class as the existing confirm-gate code).

## v2 backlog (not started, gated on real feedback — see condition below)

- [ ] **Meaningful obviousness bands.** Current `--obviousness-steps` gives even, unlabeled bands (see INTENT.md) specifically because no real score distribution exists yet to justify semantic labels or uneven cutoffs. Do not revisit this by guessing a better default — only act on it if real usage (GitHub issues/PRs from actual users running the tool on their own audio) asks for it, ideally with example scores attached. Until then, even-steps stays as-is.

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
- [x] `src/transcribe.test.ts` — `isModelCached()` = 3 tests. (`parseWhisperOutput()`'s 5 tests were removed along with the function itself — the new `@fugood/whisper.node` backend returns structured segments, no stdout to parse.)
- [x] `src/theme.test.ts` — `loadLexicFile()`, incl. theme/lexic regression test = 6 tests.
- [x] `src/analyze.test.ts` — obviousness score, matching, segmentHits = 9 tests.
- [x] `src/report.test.ts` — Markdown + terminal graphic rendering, including `computeObviousnessStep` unit tests (even division, boundary at score 1.0, arbitrary step counts, invalid input), duration-cap disclaimer (present/absent), segment-range disclaimer (explicit end/"end of audio" fallback/absent), real-vs-fallback transcript filename reference, `renderTranscriptText` (multi-segment, hour-scale timestamps, empty), and branch coverage for empty matches/segmentHits/field, hour-scale timestamps, and empty-matches terminal graphic = 30 tests. Coverage not re-measured this session.
- [x] `src/audio.test.ts` — duration probing/trimming plus `--start`/`--end` range parsing and extraction, using **real ffmpeg/ffprobe** against a generated test tone (no mocking) = 15 tests (7 duration-cap + 3 `parseTimeToSeconds` + 5 `trimToRange`). One contrived-only gap carried over from before: ffprobe succeeding but returning unparseable output — not chased, same class as other real-I/O gaps below.
- [x] `src/output.test.ts` — filename generation: same-directory convention, slugification, stem pairing, no-collision across calls, empty-theme fallback = 5 tests. 100/100/100 coverage.
- [x] `src/language.test.ts` — language detection confidence (clear EN/FR sentences vs. short ambiguous strings), match/mismatch/ambiguous outcomes = 6 tests. (The 3 whisper.cpp-log-line-parsing tests for `extractWhisperDetectedLanguage()` were removed along with that function — the new backend returns the detected language directly, no log scraping needed. Coverage not re-measured this session.)
- [x] `src/output.test.ts` (extended) — `findExistingTranscript`: found/not-found, wrong-theme ignored, most-recently-modified wins among several matches, unreadable-directory fallback. 100/100/100 coverage maintained.
- [ ] Tests for `expandTheme()` — needs a mocking strategy for `node-llama-cpp` (or a tiny local test-only GGUF); can't run against real HF downloads in a sandboxed/CI environment.
- [ ] Integration test driving `cli.ts`'s `action()` end-to-end (currently unit-level only, per module). The language-mismatch flow was smoke-tested manually instead (see the item above) — a real integration test would cover this properly.
- Current total: **84 tests, all passing** (verified in-sandbox as of this update, re-verify on the maintainer's machine before trusting the count). Remaining coverage gap: `theme.ts`'s `expandTheme()` (needs a live `node-llama-cpp` model, same class of gap as before). `transcribe.ts`'s real-model-I/O path (`ensureModelDownloaded`/`transcribe`) was smoke-tested for real this session but still has no automated test — same reasoning as `expandTheme()`.

## Docs / project hygiene

- [x] `README.md` — written. Opener/philosophy/non-goals distilled from INTENT.md (wording reviewed and revised point-by-point in chat, not copied verbatim — e.g. dropped the named-competitor comparison as overclaiming for a portfolio project). Sections: opener + one-liner example, why the obviousness score, install (Node 20+/ffmpeg prereq), flags table, philosophy, what-this-isn't, known limitations (language mismatch, thin-field), license, "made with AI, designed by human". No demo GIF yet (see item below).
- [x] Project name: `at-field` — checked clean on npm + PyPI, no meaningful GitHub collision.
- [x] License: MIT — `LICENSE` file added, `package.json` `license` field synced.
- [ ] Simulated-usage demo GIF for the README — explicitly a fabricated/scripted terminal session (canned example output matching `renderTerminalGraphic`'s format), not a real recording against real audio/model. Attempted via puppeteer (node-canvas failed: no prebuilt binary for the sandbox's Node version, no native toolchain to build it) in a scratch dir, not committed. Abandoned mid-debug this session ("done later") — puppeteer + Chromium download did work by the end, next attempt can resume from there instead of re-evaluating canvas.

## Open decisions (need an explicit answer, not an assumed default)

None currently open. (`--max-duration` defaults confirmed: `fast`=60min, `balanced`=120min, `best`=0/unlimited — see `src/presets.ts`.)
