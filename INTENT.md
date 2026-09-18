# INTENT.md

## What this is

`at-field` is a CLI tool that takes a **premade transcript** (`.srt`, `.vtt`, or plain text) and runs a **theme-crossed lexical field analysis**: given a user-supplied theme (e.g. `--theme "animals"`), it expands that theme into a lexical field (related vocabulary, not just the literal word) and measures how much of that field appears in the transcript.

It is explicitly **not** a summarizer. It does not produce "what is this about" bullet points. It answers a narrower, different question: "how much does this specific theme run through this specific text, and how?"

It does not transcribe audio itself — see "Why there's no local transcription" below for why, and bring a transcript from whatever tool already works for you.

## Why this exists (pertinence)

The transcript-summarization space is saturated (Fabric, youtube-summary-cli, dozens of hosted "paste a URL, get a summary" tools). Plain lexical/frequency-analysis tooling is also saturated (corpa, motk, Sketch Engine). The gap is the **combination**: a focused, single-shot CLI that crosses a lexical field against a *user-chosen* theme, rather than either (a) summarizing everything, or (b) doing generic frequency stats with no thematic anchor.

The closest prior art is **ThemeForge** — a local, offline, thematic-coding tool for qualitative researchers that already does theme-anchored analysis with TF-IDF/BM25 relevance ranking and Markdown export. `at-field` differentiates on:

1. **CLI-native, single-shot, stateless.** ThemeForge is a workspace (persistent project files, manual coding review, multi-transcript management) for ongoing qualitative research. `at-field` is a Unix-style tool: one command, one run, pipeable output. Built for developers/scripting, not researchers.
2. **No silent black box.** Every mode discloses its own limitations (transcript source, theme-field thinness, thematic obviousness) as part of the output — not buried in docs.
3. **No vendor lock-in on transcription.** `at-field` doesn't care how the transcript was produced — `whisper.cpp`, a paid service, YouTube captions, whatever already works for the user. It composes with the transcription tooling landscape instead of trying to own a piece of it (see the history section for why this wasn't always the plan).

## The core insight: pertinence is conditional on theme obviousness

A theme that is already the transcript's obvious, stated subject is a low-value analysis — the tool would just be confirming what a quick read already tells you. `at-field` is most useful for finding a theme that is **not** the text's stated subject (e.g. "economy" running through a nature documentary's transcript, "conflict" running through a cooking show's).

This is why the tool reports an **obviousness score** in its output: how much the transcript's content already overlaps with the literal theme term, independent of the lexical-field analysis itself. High obviousness = the result is expected and low-insight, not necessarily wrong. This is disclosed as information, not gated behind a warning the user must dismiss.

Two mechanisms were considered and explicitly **rejected**:

- **Theme-discovery mode** (suggest candidate themes with no `--theme` given): rejected for v1. This is exactly ThemeForge's core clustering feature — building it would mean competing on the ground where prior art is most mature, not on `at-field`'s actual differentiation. No evidence of user demand yet either.
- **Subject-to-topic "promotion"** (enriching a narrow theme like "dogs" using the transcript itself, once the transcript is confirmed to be about dogs): rejected as circular. A field built from the transcript to then test against the transcript is close to tautological. The actual fix for a thin field on a legitimate subject is a better theme-expansion prompt, not a promotion mechanism.

**Under active reconsideration, not yet implemented:** the obviousness-score formula itself (`literalThemeMatches / totalFieldMatches`) was found, via real testing, to structurally fail on multi-word themes — it can never register high obviousness for a topic phrase, even in the most on-topic case, since nobody speaks an arbitrary topic label verbatim. Discussion converged on a different metric ("lexical saturation": how much of the *derived* field appears in the transcript, independent of the literal theme string) — see TODO.md's "Lexical saturation redesign" section for the full agreed design and open sub-decisions. Not yet coded; the formula described above is still what's actually running.

## Implementation-level decisions made without explicit confirmation

**Resolved: no semantic labels ("High"/"Moderate"/"Low"), even-division steps instead.** Early attempts (3-band 30/70 split, 4-band quartiles, a single obvious/not-obvious threshold) all required guessing a cutoff with no data to justify it, and an odd number of bands specifically creates a "fence-sitting" middle bucket that can silently absorb most real-world scores. The adopted approach: `--obviousness-steps <n>` (default 2) divides 0–1 into `n` equal-width bands and reports which one the score falls in (`step X/N, band: A%–B%`) — no word to defend, just arithmetic. Raw percentage is always shown regardless of `n`. Implementation: `src/report.ts::computeObviousnessStep`.

**Still an open question, deliberately deferred:** even this is a placeholder — real users will likely want *meaningful* bands (domain-appropriate semantic labels, not just even division) once there's actual usage to calibrate against. That calibration needs real score distributions from real transcripts, which don't exist yet. Revisiting this is explicitly gated on real feedback (PR/issue-driven), not another round of guessing defaults — see TODO.md. (Also see the "lexical saturation" reconsideration above, which may replace even-division steps with a different two-boundary scheme entirely.)

- **Thin-field threshold** (`src/theme.ts::THIN_FIELD_THRESHOLD`): fewer than 8 terms triggers the thin-field disclaimer, on both the dynamic-expansion and `--lexic` paths. Same category of unconfirmed default as above, not yet revisited.
- **Terminal graphic sizing** (`src/report.ts`): 20-character obviousness gauge, 30-character max bar width, top-10 match cap before collapsing the rest into "... and N more". Cosmetic, lower stakes than the two above, but still undisclosed defaults.

## Theme/transcript language mismatch (resolved design)

`analyze.ts` does literal word-boundary matching between `field.terms` and the transcript text. If `--theme` is expanded in a different language than the transcript, matches collapse to near-zero — not a degraded result like the other disclaimers describe, but a **broken** one that looks like a valid "low obviousness" finding. This needed a real fix, not just a disclaimer alongside the others.

**Current design:** `--language <code>` is optional. If given, it's the explicit ground truth compared against `--theme`'s detected language. If omitted, the transcript's own language is detected directly from its actual text (`src/transcriptInput.ts`, via `franc-min`) and used instead — this is meaningfully more reliable than the tool's original design, which could only ever compare against a short `--theme` string on both sides. Either way, a mismatch is **disclosed and the user is asked to confirm**, not hard-blocked — `franc-min` can confidently misdetect short/unusual `--theme` phrases as the wrong language (not just return a low-confidence "ambiguous" result), so a rigid stop would sometimes reject genuinely valid input with no recourse but rewording blind. Confirmed via direct testing that this isn't fixable by requiring longer themes either (forcing single-word themes made detection *less* reliable, not more, in every case tried).

This went through several rounds of revision before landing here — full history of what was tried and rejected (a `--language` requirement tied to Whisper's own auto-detect, a hard-stop-only design, an implicit transcript-artifact-reuse mechanism that existed specifically to make a post-transcription hard stop cheap to retry) is preserved in git history and TODO.md's fixed-defects section rather than repeated here; most of it stopped applying once local transcription was dropped entirely (see below).

## Why there's no local transcription

`at-field` originally transcribed audio itself, locally, via Whisper. This was dropped after three separate severe failures in a row, across three different native-binding approaches, all on real test hardware:

1. **`nodejs-whisper`**: compiles whisper.cpp from source on first use (CMake + a C++ compiler), no prebuilt-binary fallback. Failed in two different ways on two separate Windows machines — a relative-path bug (fixable, see TODO.md), and a genuine upstream `ggml-cpu.c`/MinGW-w64-headers incompatibility no code change on our side could fix.
2. **`@fugood/whisper.node`**: prebuilt native binaries, no compile step — fixed the build-fragility problem, but transcription was still absurdly slow (a 4:43 clip took 30 minutes on a genuinely capable real machine, an RTX 3060 gaming rig — native whisper.cpp should be faster than realtime on any modern CPU). Root cause never identified; antivirus interference or a CPU power-plan limit were the leading unconfirmed theories.
3. **GPU acceleration**, added as the suspected fix for #2: tried GPU first, fell back to CPU-only on error. Verified working correctly in a sandbox (real GPU detected and used, correct fallback), but on real hardware retest it **locked up the machine hard enough to require a hard reset**. A native GPU-init failure apparently doesn't always surface as a catchable JS error the way the fallback assumed.

That pattern — three different libraries, three different severe failures, the last one a real safety incident — pointed at bundling native ML binaries via npm as the actual problem, not any one library's bug. Mature, independently-maintained transcription tools already exist and have already solved this reliability problem (`whisper.cpp`'s own CLI used directly, `faster-whisper`/`openai-whisper`, desktop apps like MacWhisper/Vibe/Buzz) — `at-field` doesn't need to re-solve it, and re-attempting a fourth native-binding approach was rejected outright given the trajectory.

**`node-llama-cpp` (theme expansion) was explicitly kept**, at least for now — it's a much lighter workload (a 0.5B-parameter model vs. a full ASR pipeline) and was never confirmed to be implicated in the lockup. Revisiting it (e.g. moving to a locally-running Ollama server instead, removing the last native binding) is a possible future step, deliberately not taken yet — this pivot was executed one step at a time, by explicit request, and node-llama-cpp is out of scope for this round.

**Retronym, decided but not used prominently anywhere (README, npm page):** "AT" = "Alleged Textual" (Field) — "alleged" carries the "user suspects a theme is there, tool confirms/quantifies it" framing from the core insight above; "Textual" reflects the drop from audio. Not part of the tool's public-facing branding, just an internal note on how the name still parses.

## Design philosophy

- **Simplicity and good defaults over exhaustive explicit configuration.** Early design leaned toward requiring explicit flags for everything (no assumed defaults) in the name of transparency. This was walked back: the tool needs a working, demo-able one-liner (`at-field transcript.srt --theme "animals"`) that produces an acceptable result for most users most of the time.
- **Disclosure, not gatekeeping.** Every quality/limitation signal (transcript source, field thinness, obviousness score, no-timestamps for plain-text input) is printed information, not a blocking confirmation. A language mismatch is disclosed-and-confirmed rather than silently allowed or hard-blocked — the one interactive confirm in the whole tool, and even that has a stated reason (a known detector limitation) rather than being a "prove you understand" gate. That pattern was explicitly tried and rejected as bad design elsewhere in this project's history.
- **Local-only.** Theme-field expansion runs locally via `node-llama-cpp` (in-process, no external app/daemon). No hosted API dependency, no per-run cost. Transcription is no longer this tool's concern at all (see above) — whichever tool the user picks for that step, local or hosted, is their call, not something `at-field` enables or restricts.
- **Markdown-only output.** Other output formats are a later decision, not a v1 requirement.

## Non-goals (v1)

- Not a summarizer.
- Not a qualitative-research workspace (no persistent projects, no manual coding UI, no multi-transcript comparison).
- Not a transcription tool. Audio-to-text is explicitly out of scope now (see "Why there's no local transcription") — bring your own transcript.
- Not a hosted service — CLI, local execution only.
