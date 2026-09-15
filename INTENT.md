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

## Design philosophy

- **Simplicity and good defaults over exhaustive explicit configuration.** Early design leaned toward requiring explicit flags for everything (no assumed defaults) in the name of transparency. This was walked back: the tool needs a working, demo-able one-liner (`at-field audio.mp3 --theme "animals"`) that produces an acceptable result for most users most of the time. Presets (`--preset fast|balanced|best`) now carry that complexity instead of requiring users to tune individual flags.
- **Disclosure, not gatekeeping.** Every quality/limitation signal (transcript source, model size, field thinness, obviousness score) is printed information, not a blocking confirmation. The one exception is a genuine one-time cost decision (first-time model download, `--preset best`'s size/runtime estimate) — and even there, the mechanism is a plain confirm prompt, never a "type this phrase to prove you read it" flag. That pattern was explicitly tried and rejected as bad design.
- **Local-only for v1.** Both Whisper transcription and theme-field expansion run locally. No hosted API dependency, no per-run cost, consistent with a "free" framing.
- **Markdown-only output for v1.** Other output formats are a later decision, not a v1 requirement.

## Non-goals (v1)

- Not a summarizer.
- Not a qualitative-research workspace (no persistent projects, no manual coding UI, no multi-transcript comparison).
- Not a YouTube/URL scraper — audio input is user-provided, locally.
- Not a hosted service — CLI, local execution only.
