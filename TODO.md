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
timestamped per-segment lines (was one unreadable long string). `--language`
is now a required flag — no more auto-detect, no more `auto` mode at all
(see INTENT.md for why). `npm pack` now uses a `files` allowlist after a
real incident swept stray files into the tarball. A comprehensive redesign
of the obviousness score (renamed "lexical saturation", derived-word-list
distinctness, two adjustable boundaries) has been discussed and agreed on
but **not yet implemented** — see the "Lexical saturation redesign
(agreed, not yet implemented)" section below. Remaining v1 gap: the demo
GIF.

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
- [x] `--language` flag: **implemented, then made mandatory (both this session).**
  - `--language <code>` is now **required** — `program.error` if omitted (`src/cli.ts`, same pattern as `--theme`). No more `auto` value, no more Whisper-side language auto-detection at all. Checked before any confirm gates (free/instant). Detects `--theme`'s language (`src/language.ts::detectLanguageCode`, franc-min + iso-639-3 code mapping) and compares to the given `<code>`. Mismatch → discloses both detected codes, suggests trying a longer phrase or a synonym (see the `franc-min` false-positive item below), and asks "Continue anyway?" via `confirm()` (default no) rather than blocking outright. Ambiguous (common for short `--theme` strings) → warn, proceed.
  - **Why mandatory, not auto-detected:** `franc-min` can confidently misdetect short/unusual `--theme` phrases as the wrong language (see below) — the previous `auto` mode additionally relied on Whisper auto-detecting the *audio's* language and comparing the two, compounding that same unreliable detector's risk for no real benefit. An explicit, stated language is simply more reliable, and also gives Whisper a real hint instead of its own auto-detection (a transcription-accuracy side benefit). Reasoning disclosed plainly in README's Known Limitations as a "why isn't this automatic?" explanation — the maintainer's bet is that a documented, reasoned tradeoff is far more acceptable to users than an undocumented one they have to reverse-engineer from a confusing false positive.
  - **Removed entirely**: the post-transcription "detect the audio's language via Whisper, compare to theme" code path and its hard stop — there's no more `auto` case for it to apply to. `transcript.language` still comes directly from `@fugood/whisper.node`'s structured output (the language that was used for decoding, since it's now always explicit), no more stderr-log-scraping (the nodejs-whisper-era `extractWhisperDetectedLanguage()` mechanism this replaced is documented in INTENT.md's whisper-backend section).
  - Language-detection library: `franc-min` (short strings often return `und`/unconfident — by design, not a bug) + `iso-639-3`'s `iso6393To1` map to compare against Whisper's 2-letter codes.
  - Tested: 6 cases in `src/language.test.ts` (unit tests for `checkLanguageMatch`/`detectLanguageCode` unaffected by the mandatory-flag change, which is `cli.ts` behavior). Smoke-tested for real this session: missing `--language` correctly hard-stops with the right message before any confirm gates.
  - **`franc-min` false-positive finding (from real testing, still applies):** it can *confidently* misdetect short/unusual `--theme` phrases as the wrong language, not just return low-confidence "ambiguous" — e.g. `"american patriotism"` → detected as Indonesian, `"patriotism"` alone → Tagalog; longer, more sentence-like phrases (e.g. `"freedom and country"`) detect correctly. This is the actual reason `--language` became mandatory rather than just improving the auto-mode message further. Confirmed via direct testing: forcing single-word themes would make this worse, not better (a single word detected *less* reliably than a 3+ word phrase in every case tried).
  - Known gap: `language.ts` branch coverage not re-measured after removing `extractWhisperDetectedLanguage()`; not re-run this session.

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
- [ ] **Verify real-hardware transcription speed — now confirmed real, not sandbox-specific.** The maintainer ran the JFK Cuban Missile Crisis clip (4:43, `fast` preset = `base` model) on real Windows hardware: **30 minutes**. Native whisper.cpp `base`-model transcription is normally faster than realtime on any modern CPU — this is a genuine, serious problem, not a sandbox artifact as originally suspected.
- [x] **GPU acceleration added, tried first with automatic CPU fallback.** Investigated as the likely fix for the above. `src/transcribe.ts::runTranscription` now attempts GPU (Vulkan on Windows/Linux, Metal via the `default` variant on macOS) before falling back to CPU-only on any error — `@fugood/whisper.node` already ships these binary variants as `optionalDependencies`, they were just never used. `TranscriptResult.gpuUsed` (`src/types.ts`) carries which path was used through to both terminal and Markdown disclosures (`src/cli.ts`, `src/report.ts`) — `null` for a reused transcript (no hardware info saved). Real GPU init/fallback verified working in this sandbox (a genuine `Vulkan0` discrete-GPU device was detected and used, confirmed via whisper.cpp's own log output). **However, a direct timed comparison in this same sandbox showed GPU was not actually faster** (CPU: 172.8s, Vulkan: 185.8s transcribing the same 11s clip) — both equally slow, meaning GPU-vs-CPU is likely *not* the actual bottleneck behind the 30-minute real-hardware result. The code is correct and safe to ship regardless (real dedicated GPU hardware may behave differently than whatever this sandbox exposes), but **does not resolve** the open question above — that still needs investigating on the maintainer's actual machine. Tested: typecheck clean, 87/87 tests passing (3 new: GPU-accelerated / CPU-only / omitted-when-null disclosure lines in `report.test.ts`). Not unit-tested: the GPU-init-throws-so-fall-back-to-CPU branch itself (needs a real environment where the GPU variant genuinely fails to init, which this sandbox doesn't provide — it succeeded).
- [x] **Stage-transition terminal disclosure.** Moved out of the v2 backlog into done — implemented right after the whisper-backend swap, in the same session. Three concrete additions to `src/cli.ts`: (1) the whisper-model download (when the confirm gate says yes) now runs via an explicitly-exported `ensureModelDownloaded()` (`src/transcribe.ts`) called from `cli.ts` with its own "Downloading whisper model..." message, instead of silently happening inside `transcribe()` after the "Transcribing..." line was already printed — a real, previously-silent multi-GB-download gap, not just a cosmetic reorder; (2) the transcription-start message now states the actual audio duration being transcribed (`Transcribing 0.2 min of audio with model "tiny"...`) — a known fact, not a time estimate, confirmed by design discussion that a guessed ETA risks being visibly wrong and eroding trust more than no estimate; (3) a "Expanding theme ... into a lexical field..." message before the dynamic (`--lexic`-less) theme-expansion path only — skipped for `--lexic`, since a file read is effectively instant and doesn't need a stage message. Analysis itself (also listed in the original ask) was deliberately left without a stage message — it's synchronous and near-instant, not a silent wait. Smoke-tested for real: confirmed the duration message renders correctly (`Transcribing 0.2 min of audio...`) in a fresh (non-reused) run. Typecheck clean, 81/81 tests passing (no new tests added — these are `console.log` side effects in `cli.ts`'s `action()`, same untested-interactive-flow class as the existing confirm-gate code).

## Lexical saturation redesign (agreed, not yet implemented)

Triggered by real testing: a JFK speech explicitly about the Cuban Missile Crisis scored 0% obviousness against `--theme "nuclear war and diplomacy"`, because `literalThemeMatches` required the exact 4-word theme phrase to appear verbatim — which no one says, even when maximally on-topic. Discussion concluded the entire formula's premise was wrong, not just this edge case. See chat history for the full back-and-forth; this section is the agreed destination, not the reasoning trail (that belongs in a future INTENT.md pass once implemented).

**Agreed design:**
- **Rename** `obviousnessScore` → **"lexical saturation"**. Not just cosmetic — the old name implied a value judgment ("high obviousness = boring") the new mechanism doesn't make.
- **New computation**: saturation measures how much of the *derived* word list appears in the transcript — not a ratio against literal theme-string matches. High = the field's vocabulary saturates the audio (theme runs deep/pervasively). Low = marginal, incidental touch (present, but not meaningful). Exact normalization (distinct terms found / total field size? weighted by occurrence count? something else?) is **not yet decided** — needs picking before implementation.
- **Derived word list must exclude the theme's own words** — each individual word of the theme (not just the exact phrase), for the dynamic (`expandTheme()`) path only. Rationale: including them would let a hit on the theme's own vocabulary inflate the "surrounding presence" signal with the same evidence already implied by the theme itself — tautological, and specifically the kind of circularity INTENT.md already rejected for "subject-to-topic promotion" (see INTENT.md non-goals).
- **Derived words must be "distinct enough from each other"** (dynamic path only) — avoids the field being dominated by near-synonym clusters (e.g. "nuclear/atomic/nuke/thermonuclear") that inflate saturation without adding real breadth. Mechanism agreed: local embedding-based cosine-similarity filtering via `node-llama-cpp`'s existing `LlamaEmbeddingContext` (already a dependency, confirmed to support embeddings — zero new packages needed). Rejected alternatives (researched): pure string-similarity libraries (only catch spelling variants, not true synonyms like "nuclear"/"atomic"); dictionary/WordNet-based synonym packages (English-only, would need a separate dataset per language, real added complexity given this project's multilingual needs). **Open, not yet decided**: use a dedicated small multilingual embedding model (new one-time download, better semantic quality) vs. reuse the existing Qwen2.5 theme-expansion model's own embedding output (no extra download, likely lower quality for this purpose).
- **No filtering of any kind on `--lexic` user-supplied wordlists.** Explicit maintainer call: `--lexic` is for experienced users who know what they're doing with that flag; the tool should trust their input as-is, not second-guess or silently modify it.
- **Two adjustable boundary flags replace `--obviousness-steps`'s even-division bands entirely.** Defaults: 10% (low) and 70% (high) — arbitrary, explicitly disclosed as such, meant for experienced users to override via flags. Low boundary filters for rarity (below it = too incidental to mean anything); high boundary filters for "explicit but not overwhelming" (above it = the field dominates the content). This reopens a previously-resolved INTENT.md decision (even-division bands specifically to avoid defending an arbitrary cutoff) — the maintainer's explicit position: the earlier rejection was about an *undefendable, unadjustable* cutoff; a disclosed, flag-adjustable default doesn't have that problem, and needs documenting as a deliberate reversal, not a silent one.
- **Reported as a plain numeric score, no semantic labels for the three zones** (below-low / between / above-high) — maintainer's call: "its meaning would make sense only for the user," so the tool states the number and the configured boundaries, nothing more interpretive than that.

**Not yet decided / needs resolution before implementation:**
- Exact saturation-score normalization formula.
- Embedding model choice for the distinctness filter (dedicated download vs. reuse existing model).
- New flag names (e.g. something like `--saturation-low <pct>` / `--saturation-high <pct>` — not settled).
- Whether `--obviousness-steps` is removed outright or kept for some other purpose.
- Full scope of files touched: at minimum `src/analyze.ts` (formula), `src/theme.ts` (exclusion + distinctness filtering), `src/report.ts` (rename + new boundary display), `src/cli.ts` (new flags), `src/types.ts` (rename fields), plus every test file covering the old `obviousnessScore`/`computeObviousnessStep` behavior, and a substantial INTENT.md rewrite (this is a reversal of previously-resolved decisions, not an addition).

## v2 backlog (not started, gated on real feedback — see condition below)

- [ ] **Meaningful obviousness bands.** Superseded by the lexical-saturation redesign above (two adjustable boundaries instead of even-division steps) — kept here crossed out for history, not an active item. ~~Current `--obviousness-steps` gives even, unlabeled bands (see INTENT.md) specifically because no real score distribution exists yet to justify semantic labels or uneven cutoffs. Do not revisit this by guessing a better default — only act on it if real usage (GitHub issues/PRs from actual users running the tool on their own audio) asks for it, ideally with example scores attached. Until then, even-steps stays as-is.~~

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
