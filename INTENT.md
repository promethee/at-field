# INTENT.md

## What this is

`at-field` is a CLI tool that takes a **premade transcript** (`.srt`, `.vtt`, or plain text) and runs a **theme-crossed lexical field analysis**: given a user-supplied theme (e.g. `--theme "animals"`), it expands that theme into a lexical field (related vocabulary, not just the literal word) and measures how much of that field appears in the transcript.

It is explicitly **not** a summarizer. It does not produce "what is this about" bullet points. It answers a narrower, different question: "how much does this specific theme run through this specific text, and how?"

It does not transcribe audio itself — see "Why there's no local transcription" below for why, and bring a transcript from whatever tool already works for you.

## Why this exists (pertinence)

The transcript-summarization space is saturated (Fabric, youtube-summary-cli, dozens of hosted "paste a URL, get a summary" tools). Plain lexical/frequency-analysis tooling is also saturated (corpa, motk, Sketch Engine). The gap is the **combination**: a focused, single-shot CLI that crosses a lexical field against a *user-chosen* theme, rather than either (a) summarizing everything, or (b) doing generic frequency stats with no thematic anchor.

The closest prior art is **ThemeForge** — a local, offline, thematic-coding tool for qualitative researchers that already does theme-anchored analysis with TF-IDF/BM25 relevance ranking and Markdown export. `at-field` differentiates on:

1. **CLI-native, single-shot, stateless.** ThemeForge is a workspace (persistent project files, manual coding review, multi-transcript management) for ongoing qualitative research. `at-field` is a Unix-style tool: one command, one run, pipeable output. Built for developers/scripting, not researchers.
2. **No silent black box.** Every mode discloses its own limitations (transcript source, theme-field thinness, lexical saturation) as part of the output — not buried in docs.
3. **No vendor lock-in on transcription.** `at-field` doesn't care how the transcript was produced — `whisper.cpp`, a paid service, YouTube captions, whatever already works for the user. It composes with the transcription tooling landscape instead of trying to own a piece of it (see the history section for why this wasn't always the plan).

## The core insight: pertinence depends on how much of the theme's vocabulary the text carries

A theme that is the transcript's obvious, stated subject is a low-value analysis — the tool would just confirm what a quick read already tells you. `at-field` is most useful for finding a theme that is **not** the text's stated subject (e.g. "economy" running through a nature documentary's transcript, "conflict" running through a cooking show's).

This is why the tool reports a **lexical saturation** score: how much of the theme's *derived vocabulary* shows up in the transcript. Computed as distinct field terms found ÷ field size (e.g. 3 of 15 terms = 20%), and shown next to the raw counts and a density figure (field-term matches per 1,000 words) so the number explains itself. Coverage alone can't tell a passing mention from a pervasive one in a long text, hence the density line. It is reported as information, not gated behind a warning.

Two mechanisms were considered and explicitly **rejected**:

- **Theme-discovery mode** (suggest candidate themes with no `--theme` given): rejected for v1. This is exactly ThemeForge's core clustering feature — building it would mean competing on the ground where prior art is most mature, not on `at-field`'s actual differentiation. No evidence of user demand yet either.
- **Subject-to-topic "promotion"** (enriching a narrow theme like "dogs" using the transcript itself, once the transcript is confirmed to be about dogs): rejected as circular. A field built from the transcript to then test against the transcript is close to tautological. The actual fix for a thin field on a legitimate subject is a better theme-expansion prompt, not a promotion mechanism.

## Implementation-level decisions made without explicit confirmation

**Reversal, documented deliberately: this replaced the earlier "obviousness score".** That score was `literalThemeMatches / totalFieldMatches`, and real testing showed it structurally read 0% for texts that clearly touched the theme — a French transcript with 10 field-term matches and no literal "loisirs" scored 0% — because nobody speaks an arbitrary topic label verbatim. The name was also wrong: "obviousness" implied a value judgment (high = boring) that the new mechanism doesn't make. Along with it, the even-division `--obviousness-steps` bands were replaced by two boundaries (below).

**Two adjustable boundaries, defaults 10% and 70%** (`--saturation-low`, `--saturation-high`, `src/report.ts`). The defaults are arbitrary and disclosed as such; they exist so a first run produces a usable reading and experienced users override them. This reverses the earlier rejection of fixed cutoffs: that rejection was about an *undefendable, unadjustable* cutoff; a disclosed, flag-adjustable default doesn't have that problem. The report states where the score sits — below the low boundary, between, or above the high boundary — and nothing more interpretive: no "High"/"Low" labels, because what a position means depends on the user's material and question. Low is meant to filter for rarity (below it, too incidental to mean much); high for "explicit but not overwhelming" (above it, the field dominates the content).

**The derived field excludes the theme's own words** (dynamic expansion only, `src/theme.ts::cleanExpandedTerms`). Counting a hit on the theme's own vocabulary would inflate saturation with evidence the theme already implies — circular, the same objection as subject-to-topic promotion. It also keeps only single words: matching is literal word-boundary, so multi-word phrases the model invents never match, and near-duplicates are dropped. `--lexic` wordlists are the user's own and are never filtered.

**Not yet built, still agreed:** requiring derived words to be distinct from each other by embedding similarity (via Ollama's embeddings endpoint), so near-synonym clusters can't pad the field. Model choice for that is undecided; see TODO.md.

- **Thin-field threshold** (`src/theme.ts::THIN_FIELD_THRESHOLD`): fewer than 8 terms triggers the thin-field disclaimer, on both the dynamic-expansion and `--lexic` paths. Same category of unconfirmed default as above, not yet revisited.
- **Terminal graphic sizing** (`src/report.ts`): 20-character saturation gauge, 30-character max bar width, top-10 match cap before collapsing the rest into "... and N more". Cosmetic, lower stakes than the two above, but still undisclosed defaults.

## Theme/transcript language mismatch (resolved design)

`analyze.ts` does literal word-boundary matching between `field.terms` and the transcript text. If `--theme` is expanded in a different language than the transcript, matches collapse to near-zero — not a degraded result like the other disclaimers describe, but a **broken** one that looks like a valid "low saturation" finding. This needed a real fix, not just a disclaimer alongside the others.

**Current design:** `--language <code>` is optional. If given, it's the explicit ground truth compared against `--theme`'s detected language. If omitted, the transcript's own language is detected directly from its actual text (`src/transcriptInput.ts`, via `franc-min`) and used instead — this is meaningfully more reliable than the tool's original design, which could only ever compare against a short `--theme` string on both sides. Either way, a mismatch is **disclosed and the user is asked to confirm**, not hard-blocked — `franc-min` can confidently misdetect short/unusual `--theme` phrases as the wrong language (not just return a low-confidence "ambiguous" result), so a rigid stop would sometimes reject genuinely valid input with no recourse but rewording blind. Confirmed via direct testing that this isn't fixable by requiring longer themes either (forcing single-word themes made detection *less* reliable, not more, in every case tried).

This went through several rounds of revision before landing here — full history of what was tried and rejected (a `--language` requirement tied to Whisper's own auto-detect, a hard-stop-only design, an implicit transcript-artifact-reuse mechanism that existed specifically to make a post-transcription hard stop cheap to retry) is preserved in git history and TODO.md's fixed-defects section rather than repeated here; most of it stopped applying once local transcription was dropped entirely (see below).

**Update after real French testing:** the expansion prompt now names the transcript's language (`src/theme.ts::expandTheme`), so the field is written in the transcript's language even when `--theme` is in another. That weakens this section's original premise — a theme/transcript language mismatch no longer produces a field that can't match. The "could not confidently detect the theme's language" message (the ambiguous case) was removed as pure noise: it fired on nearly every single-word theme with nothing for the user to act on. The mismatch *confirm* was kept for now, but is a candidate for removal too; see TODO.md.

## Why there's no native ML binding left in this tool at all

`at-field` originally transcribed audio itself, locally, via Whisper, and separately ran theme expansion in-process via `node-llama-cpp`. Both are gone now — dropped after four separate severe failures in a row, across four different native-binding approaches, all on real test hardware:

1. **`nodejs-whisper`**: compiles whisper.cpp from source on first use (CMake + a C++ compiler), no prebuilt-binary fallback. Failed in two different ways on two separate Windows machines — a relative-path bug (fixable, see TODO.md), and a genuine upstream `ggml-cpu.c`/MinGW-w64-headers incompatibility no code change on our side could fix.
2. **`@fugood/whisper.node`**: prebuilt native binaries, no compile step — fixed the build-fragility problem, but transcription was still absurdly slow (a 4:43 clip took 30 minutes on a genuinely capable real machine, an RTX 3060 gaming rig — native whisper.cpp should be faster than realtime on any modern CPU). Root cause never identified; antivirus interference or a CPU power-plan limit were the leading unconfirmed theories.
3. **GPU acceleration**, added as the suspected fix for #2: tried GPU first, fell back to CPU-only on error. Verified working correctly in a sandbox (real GPU detected and used, correct fallback), but on real hardware retest it **locked up the machine hard enough to require a hard reset**. A native GPU-init failure apparently doesn't always surface as a catchable JS error the way the fallback assumed. This (plus #1/#2) is what triggered dropping audio/Whisper entirely (see "What this is" above) — `node-llama-cpp` (theme expansion) was explicitly kept at the time, since it's a much lighter workload and was never confirmed to be implicated in the lockup.
4. **`node-llama-cpp`**, kept through the text-to-text pivot above, then failed the same way on its own: real-hardware testing found `expandTheme()`'s generation could stall indefinitely on CPU with zero token output — one run was killed after 3 hours, a retry after adding a `maxTokens` cap still produced no output after 32 minutes. Not merely slow like #2; no progress at all, same "silently stuck, no catchable error" shape as the GPU lockup in #3.

That pattern — four different libraries, four different severe failures — confirms bundling native ML binaries via npm as the actual problem, not any one library's bug, not a coincidence needing a fifth attempt to fix. **Resolution: `node-llama-cpp` replaced with a local Ollama server** (`src/theme.ts`, calls `POST /api/generate` over HTTP against `OLLAMA_HOST` or `localhost:11434`). Ollama is a separately-installed, separately-maintained standalone binary — no native code runs inside `at-field`'s own process anymore, for either transcription or theme expansion. This is the same "bring your own already-reliable tool" model already adopted for transcription (point 3 under "Why this exists" above) — Ollama's own model management (`ollama pull`) replaces the old download-and-cache logic entirely. A `maxTokens`/`num_predict` cap is kept regardless (real fix, independent of which backend runs it): unconstrained generation length was itself a latent bug, not just a symptom of `node-llama-cpp` specifically.

**Retronym, decided but not used prominently anywhere (README, npm page):** "AT" = "Alleged Textual" (Field) — "alleged" carries the "user suspects a theme is there, tool confirms/quantifies it" framing from the core insight above; "Textual" reflects the drop from audio. Not part of the tool's public-facing branding, just an internal note on how the name still parses.

## Design philosophy

- **Simplicity and good defaults over exhaustive explicit configuration.** Early design leaned toward requiring explicit flags for everything (no assumed defaults) in the name of transparency. This was walked back: the tool needs a working, demo-able one-liner (`at-field transcript.srt --theme "animals"`) that produces an acceptable result for most users most of the time.
- **Disclosure, not gatekeeping.** Every quality/limitation signal (transcript source, field thinness, saturation, no-timestamps for plain-text input) is printed information, not a blocking confirmation. A language mismatch is disclosed-and-confirmed rather than silently allowed or hard-blocked — the one interactive confirm in the whole tool, and even that has a stated reason (a known detector limitation) rather than being a "prove you understand" gate. That pattern was explicitly tried and rejected as bad design elsewhere in this project's history.
- **Local-only.** Theme-field expansion runs locally via `node-llama-cpp` (in-process, no external app/daemon). No hosted API dependency, no per-run cost. Transcription is no longer this tool's concern at all (see above) — whichever tool the user picks for that step, local or hosted, is their call, not something `at-field` enables or restricts.
- **Markdown-only output.** Other output formats are a later decision, not a v1 requirement.

## Non-goals (v1)

- Not a summarizer.
- Not a qualitative-research workspace (no persistent projects, no manual coding UI, no multi-transcript comparison).
- Not a transcription tool. Audio-to-text is explicitly out of scope now (see "Why there's no local transcription") — bring your own transcript.
- Not a hosted service — CLI, local execution only.
