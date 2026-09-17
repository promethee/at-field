# INTENT.md

## What this is

`at-field` is a CLI tool that takes a user-provided local audio file, transcribes it locally (Whisper), and runs a **theme-crossed lexical field analysis**: given a user-supplied theme (e.g. `--theme "animals"`), it expands that theme into a lexical field (related vocabulary, not just the literal word) and measures how much of that field appears in the transcript.

It is explicitly **not** a summarizer. It does not produce "what is this audio about" bullet points. It answers a narrower, different question: "how much does this specific theme run through this specific audio, and how?"

## Why this exists (pertinence)

The transcript-summarization space is saturated (Fabric, youtube-summary-cli, dozens of hosted "paste a URL, get a summary" tools). Plain lexical/frequency-analysis tooling is also saturated (corpa, motk, Sketch Engine). The gap is the **combination**: a focused, single-shot, audio-first CLI that crosses a lexical field against a *user-chosen* theme, rather than either (a) summarizing everything, or (b) doing generic frequency stats with no thematic anchor.

The closest prior art is **ThemeForge** — a local, offline, thematic-coding tool for qualitative researchers that already does theme-anchored analysis with TF-IDF/BM25 relevance ranking and Markdown export. `at-field` differentiates on:

1. **Audio-first.** ThemeForge and most competitors assume you already have a transcript file. `at-field` takes raw audio as the primary input.
2. **CLI-native, single-shot, stateless.** ThemeForge is a workspace (persistent project files, manual coding review, multi-transcript management) for ongoing qualitative research. `at-field` is a Unix-style tool: one command, one run, pipeable output. Built for developers/scripting, not researchers.
3. **No silent black box.** Every mode discloses its own limitations (transcript quality, model size, theme-field thinness, thematic obviousness) as part of the output — not buried in docs.

## The core insight: pertinence is conditional on theme obviousness

A theme that is already the audio's obvious, stated subject is a low-value analysis — the tool would just be confirming what a ten-second listen already tells you. `at-field` is most useful for finding a theme that is **not** the audio's stated subject (e.g. "economy" running through a nature documentary, "conflict" running through a cooking show).

This is why the tool reports an **obviousness score** in its output: how much the audio's content already overlaps with the literal theme term, independent of the lexical-field analysis itself. High obviousness = the result is expected and low-insight, not necessarily wrong. This is disclosed as information, not gated behind a warning the user must dismiss.

Two mechanisms were considered and explicitly **rejected**:

- **Theme-discovery mode** (suggest candidate themes with no `--theme` given): rejected for v1. This is exactly ThemeForge's core clustering feature — building it would mean competing on the ground where prior art is most mature, not on `at-field`'s actual differentiation. No evidence of user demand yet either.
- **Subject-to-topic "promotion"** (enriching a narrow theme like "dogs" using the transcript itself, once the audio is confirmed to be about dogs): rejected as circular. A field built from the transcript to then test against the transcript is close to tautological. The actual fix for a thin field on a legitimate subject is a better theme-expansion prompt, not a promotion mechanism.

## Implementation-level decisions made without explicit confirmation

The obviousness-score *formula* (`literalThemeMatches / totalFieldMatches`) was designed and agreed on together. The interpretation layer on top of it was not, and went through several iterations before landing on the current approach — documented here for that reason.

**Resolved: no semantic labels ("High"/"Moderate"/"Low"), even-division steps instead.** Early attempts (3-band 30/70 split, 4-band quartiles, a single obvious/not-obvious threshold) all required guessing a cutoff with no data to justify it, and an odd number of bands specifically creates a "fence-sitting" middle bucket that can silently absorb most real-world scores. The adopted approach: `--obviousness-steps <n>` (default 2) divides 0–1 into `n` equal-width bands and reports which one the score falls in (`step X/N, band: A%–B%`) — no word to defend, just arithmetic. Raw percentage is always shown regardless of `n`. Implementation: `src/report.ts::computeObviousnessStep`.

**Still an open question, deliberately deferred to v2:** even this is a placeholder — real users will likely want *meaningful* bands (domain-appropriate semantic labels, not just even division) once there's actual usage to calibrate against. That calibration needs real score distributions from real audio, which don't exist yet (the demo audio set that could supply them is itself deferred — see Non-goals/TODO.md). Revisiting this is explicitly gated on real feedback (PR/issue-driven), not another round of guessing defaults — see TODO.md.

- **Thin-field threshold** (`src/theme.ts::THIN_FIELD_THRESHOLD`): fewer than 8 terms triggers the thin-field disclaimer, on both the dynamic-expansion and `--lexic` paths. Same category of unconfirmed default as above, not yet revisited.
- **Terminal graphic sizing** (`src/report.ts`): 20-character obviousness gauge, 30-character max bar width, top-10 match cap before collapsing the rest into "... and N more". Cosmetic, lower stakes than the two above, but still undisclosed defaults.

## Theme/audio language mismatch (resolved design, not yet implemented)

`analyze.ts` does literal word-boundary matching between `field.terms` and the transcript text. If `--theme` is expanded in a different language than the audio, matches collapse to near-zero — not a degraded result like the other disclaimers describe, but a **broken** one that looks like a valid "low obviousness" finding. This needed a real fix, not just a disclaimer alongside the others.

Resolved approach:
- `--language <code>` set explicitly: detect `--theme`'s language, compare to `<code>`. Mismatch → hard stop before transcribing (the user already stated ground truth, so there's nothing ambiguous to warn about instead). Ambiguous detection → warn, don't block.
- `--language auto` (default): auto only tells Whisper to detect the language itself — it does not translate anything, and there's nothing to check pre-transcription. Transcribe first, then compare `--theme`'s language to Whisper's detected language; stop before writing the report on mismatch. Transcription cost is already spent either way, so stopping late still prevents a misleading result from reaching the user.
- Rejected alternatives: translating the theme into the transcript's language (a harder, less predictable task than expansion, new failure mode); a `--theme-language` flag (doesn't solve the default case, just adds an escape hatch on top of whichever default is chosen); confirm-gate-only with a `--yes` bypass (doesn't work for the `auto` case, since the transcript's language isn't known until after transcription runs anyway).
- **Implicit transcript-artifact reuse** (implemented, see TODO.md) removes the real cost of the `auto`-case stop: since a mismatch is only caught after transcription, the transcript is already written to disk (per the output-file convention) — a retry globs for and reuses it instead of re-transcribing from scratch, skipping all Whisper-related confirm gates too, not just the transcribe call. No new flag for this; it's a side effect of the existing output convention, not a separate feature.

Two claims made while reasoning through this turned out to be wrong and are worth recording so they aren't repeated: (1) that avoiding re-transcription would require a new `--transcript-file` flag — it doesn't, implicit convention-based reuse covers it; (2) that transcript reuse would conflict with this project's "no persistent state" stance — checked against the actual INTENT.md text, that stance is about ThemeForge-style multi-session research workspaces (persistent projects, manual coding review, multi-transcript comparison), not about a single run reading back one file it just wrote for the same audio+theme. Reusing one sibling artifact doesn't fall under that non-goal.

**Implemented.** Two things surfaced during implementation that the design discussion didn't anticipate:
- `nodejs-whisper`'s `nodewhisper()` return value never actually contains Whisper's auto-detected language — whisper.cpp writes that line to stderr, which the library only forwards to a caller-supplied `logger.debug()`, not the resolved promise. `TranscriptResult.language` was silently echoing back the *requested* language string ("auto") instead of what Whisper actually detected — a real bug, not just a missing feature, since the auto-mode mismatch check depends on the real detected value. Fixed in `src/transcribe.ts` by passing a capturing logger and parsing the `auto-detected language: en (p = 0.99)` line.
- The explicit-`--language` check was initially placed after the confirm gates (model-download, `--preset best`), meaning a user would be asked to confirm a multi-hundred-MB download before being told their invocation was invalid. Moved to run first — it's free and instant, so there's no reason to pay any confirm-prompt cost before it. Caught by smoke-testing before shipping, not by a design review.

## Design philosophy

- **Simplicity and good defaults over exhaustive explicit configuration.** Early design leaned toward requiring explicit flags for everything (no assumed defaults) in the name of transparency. This was walked back: the tool needs a working, demo-able one-liner (`at-field audio.mp3 --theme "animals"`) that produces an acceptable result for most users most of the time. Presets (`--preset fast|balanced|best`) now carry that complexity instead of requiring users to tune individual flags.
- **Disclosure, not gatekeeping.** Every quality/limitation signal (transcript source, model size, field thinness, obviousness score) is printed information, not a blocking confirmation. The one exception is a genuine one-time cost decision (first-time model download, `--preset best`'s size/runtime estimate) — and even there, the mechanism is a plain confirm prompt, never a "type this phrase to prove you read it" flag. That pattern was explicitly tried and rejected as bad design.
- **Local-only for v1.** Both Whisper transcription and theme-field expansion run locally. No hosted API dependency, no per-run cost, consistent with a "free" framing. Theme expansion uses `node-llama-cpp` (in-process, no external app/daemon — fits the "runs in a terminal, self-contained" framing better than an Ollama-style client/server split; tradeoff is a heavier native-binding install than a thin HTTP client would need).
- **Markdown-only output for v1.** Other output formats are a later decision, not a v1 requirement.

## Non-goals (v1)

- Not a summarizer.
- Not a qualitative-research workspace (no persistent projects, no manual coding UI, no multi-transcript comparison).
- Not a YouTube/URL scraper — audio input is user-provided, locally.
- Not a hosted service — CLI, local execution only.
