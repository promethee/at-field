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

**The derived field is cleaned after the model returns it** (dynamic expansion only, `src/theme.ts::cleanExpandedTerms`), because small models ignore instructions about it:
- *Single words only.* Matching is literal word-boundary, so multi-word phrases the model invents never match.
- *The theme's own words are excluded.* A hit on the theme's own vocabulary would inflate saturation with evidence the theme already implies — circular, the same objection as subject-to-topic promotion.
- *Variants of an already-kept term are dropped* (first one listed wins): a term sharing 5+ leading letters with a kept term is treated as an inflection/derivation of it. Real French output padded a 31-term field with 13 variants of 6 roots (lecture/lectrices, voyage/voyageur/voyageuse, photographie/photographe/photographique...), which inflates the field size and deflates saturation. The rule is deliberately conservative: 5 letters avoids merging distinct short roots (jeu/jeune, parc/parce, art/article), at the cost of missing variants of short roots (art/artistes, lecture/lecteur) and one known false merge (marché/marchandise). On the real field it drops 8 terms (31 -> 23, 6% -> 8.7%).
`--lexic` wordlists are the user's own and are never filtered.

**Considered and not built: embedding-based distinctness** (Ollama's embeddings endpoint, `bge-m3`, cosine 0.75). Prototyped on the same field: the same 31 -> 23, but it needs a second 1.2 GB model, added ~42 s on the slow dev machine, and still missed lecture/lecteur. No gain over the prefix rule for the padding actually observed (morphological, not synonymous). Worth revisiting only if real runs show synonym clusters padding a field. Numbers are in TODO.md.

- **Thin-field threshold** (`src/theme.ts::THIN_FIELD_THRESHOLD`): fewer than 8 terms triggers the thin-field disclaimer, on both the dynamic-expansion and `--lexic` paths. Same category of unconfirmed default as above, not yet revisited.
- **Terminal graphic sizing** (`src/report.ts`): 20-character saturation gauge, 30-character max bar width, top-10 match cap before collapsing the rest into "... and N more". Cosmetic, lower stakes than the two above, but still undisclosed defaults.

## Language handling (resolved: no theme/transcript mismatch check)

Matching in `analyze.ts` is literal word-boundary against the transcript, so a field in the wrong language scores 0 and looks like a valid "low saturation" finding. The tool once tried to *detect* that situation — comparing a language guess for the short `--theme` string against the transcript's language, first as a hard stop, then as a confirm prompt, then with a mandatory `--language` flag. All of it rested on `franc-min` classifying short strings, which it does badly: it confidently mislabels short phrases (e.g. "patriotism" as Tagalog) and returns "unknown" for most single words, so the check both rejected valid input and stayed silent when it mattered.

**Current design: prevent the problem instead of detecting it, and remove the check.** The transcript's language is either given via `--language` or detected from the transcript's own (long, reliable) text in `src/transcriptInput.ts`. That language is passed into the expansion prompt (`src/theme.ts::expandTheme`), which tells the model to write every term in it "even if the theme is given in another language". A `--theme` in a different language than the transcript therefore just works, and there is nothing left to warn or confirm about. `--lexic` wordlists are the user's own and are used as given. The remaining weak point is the model's ability to write in that language, which is why the default model is `qwen2.5:3b` (sub-1B models returned junk in French).

Full history of the earlier designs is in git history and TODO.md's fixed-defects section.

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
- **Disclosure, not gatekeeping.** Every quality/limitation signal (transcript source, field thinness, saturation, no-timestamps for plain-text input) is printed information, not a blocking confirmation. The only interactive prompt left is the offer to `ollama pull` a missing model, which falls back to its default when there's no TTY. "Prove you understand" confirmation gates were explicitly tried and rejected as bad design in this project's history (the old language-mismatch confirm was the last one, now removed).
- **Local-only.** Theme-field expansion runs locally via `node-llama-cpp` (in-process, no external app/daemon). No hosted API dependency, no per-run cost. Transcription is no longer this tool's concern at all (see above) — whichever tool the user picks for that step, local or hosted, is their call, not something `at-field` enables or restricts.
- **Markdown-only output.** Other output formats are a later decision, not a v1 requirement.

## Non-goals (v1)

- Not a summarizer.
- Not a qualitative-research workspace (no persistent projects, no manual coding UI, no multi-transcript comparison).
- Not a transcription tool. Audio-to-text is explicitly out of scope now (see "Why there's no local transcription") — bring your own transcript.
- Not a hosted service — CLI, local execution only.
