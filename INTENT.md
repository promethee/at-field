# INTENT.md

## What this is

`at-field` is a CLI that takes a premade transcript (`.srt`, `.vtt` or plain text) and runs a theme-crossed lexical field analysis. The user supplies a theme, for example `--theme "animals"`. The tool expands it into a lexical field of related vocabulary and measures how much of that field appears in the transcript.

It answers one question: how much does this specific theme run through this specific text? A summary of what a text covers belongs to a summarizer. Audio transcription belongs to a transcription tool, and the transcript can come from whatever tool already works for the user (see "Why there's no native ML binding in this tool").

## Why this exists (pertinence)

The transcript-summarization space is crowded (Fabric, youtube-summary-cli, dozens of hosted "paste a URL, get a summary" tools), and so is plain lexical and frequency-analysis tooling (corpa, motk, Sketch Engine). The gap is the combination: a focused, single-shot CLI that crosses a lexical field with a user-chosen theme. Summarizers cover everything, and frequency tools have no thematic anchor.

The closest prior art is ThemeForge, a local, offline thematic-coding tool for qualitative researchers, with theme-anchored analysis, TF-IDF/BM25 relevance ranking and Markdown export. at-field differs in three ways:

1. It is CLI-native, single-shot and stateless. ThemeForge is a workspace with persistent project files, manual coding review and multi-transcript management for ongoing qualitative research. at-field is a Unix-style tool: one command, one run, pipeable output, built for developers and scripting.
2. Every run discloses its own limitations (transcript source, field thinness, lexical saturation) as part of the output.
3. Transcription is left to other tools. at-field accepts a transcript from `whisper.cpp`, a paid service, YouTube captions or anything else, and composes with the transcription landscape without owning a piece of it. The tool did not always work this way; see the history section.

## The core insight: pertinence depends on how much of the theme's vocabulary the text carries

A theme that is the transcript's stated subject gives a low-value analysis, since the tool would confirm what a quick read already shows. at-field is most useful for a theme that sits beneath the text's subject: economy in a nature documentary's transcript, conflict in a cooking show's.

That is why the tool reports lexical saturation: how much of the theme's derived vocabulary shows up in the transcript. It is the number of distinct field words found divided by the field size (for example 3 of 15 words is 20%), shown next to the raw counts and a density figure (field-word matches per 1,000 words) so the number explains itself. Coverage says how much of the vocabulary appears, and density says how often. Together they separate a passing mention from a pervasive one in a long text. The score is reported as information and carries no warning gate.

Two mechanisms were considered and rejected:

- **Theme discovery** (suggesting candidate themes when no `--theme` is given) is rejected for v1. It is ThemeForge's core clustering feature, where prior art is most mature and at-field's differentiation is weakest. There is no evidence of user demand either.
- **Subject-to-topic promotion** (enriching a narrow theme like "dogs" with the transcript itself, once the transcript is confirmed to be about dogs) is circular. A field built from a transcript and tested against the same transcript is close to tautological. A thin field on a legitimate subject calls for a better expansion prompt.

## Implementation-level decisions made without explicit confirmation

**Reversal, documented deliberately: saturation replaced the earlier "obviousness score".** That score was `literalThemeMatches / totalFieldMatches`. Real testing showed it read 0% for texts that clearly touched the theme: a French transcript with 10 field-word matches and no literal "loisirs" scored 0%, because speakers rarely say an abstract topic label verbatim. The name also implied a value judgment (high obviousness means boring), which saturation avoids. The even-division `--obviousness-steps` bands were replaced by two boundaries at the same time.

**Two adjustable boundaries, defaults 10% and 70%** (`--saturation-low`, `--saturation-high`, `src/report.ts`). The defaults are arbitrary and disclosed as such. They exist so a first run gives a usable reading and experienced users can override them. This reverses the earlier rejection of fixed cutoffs, which objected to a cutoff that could be neither defended nor adjusted; a disclosed, adjustable default avoids that objection. The report states where the score sits (below the low boundary, between, or above the high boundary) and stops there. It uses no "High" or "Low" labels, because what a position means depends on the user's material and question. The low boundary filters for rarity (below it, too incidental to mean much) and the high boundary for "explicit without dominating" (above it, the field dominates the content).

**The derived field is cleaned after the model returns it** (dynamic expansion only, `src/theme.ts::cleanExpandedTerms`), because small models ignore instructions about it:

- *Single words only.* Matching is literal by word boundary, so the multi-word phrases a model invents never match.
- *The theme's own words are excluded.* A hit on the theme's own vocabulary would inflate saturation with evidence the theme already implies. This is circular, the same objection as subject-to-topic promotion.
- *Variants of an already-kept word are dropped, and the first one listed wins.* A word sharing 5 or more leading letters with a kept word is treated as an inflection or derivation of it. Real French output padded a 31-word field with 13 variants of 6 roots (lecture/lectrices, voyage/voyageur/voyageuse, photographie/photographe/photographique), which inflates the field size and deflates saturation. The rule is deliberately conservative. Five letters avoids merging distinct short roots (jeu/jeune, parc/parce, art/article), at the cost of missing variants of short roots (art/artistes, lecture/lecteur) and one known false merge (marché/marchandise). On the real field it dropped 8 words (31 to 23, 6% to 8.7%).

`--lexic` wordlists belong to the user and are used as written.

**How the model is asked, and how big the field is.** The prompt asks for the plain, everyday words a speaker or writer on the theme would use, with an unrelated example theme, and steers away from rare, technical or literary words. An earlier wording ("commonly associated", "clearly different from the others") returned words like "eschatology" and "sacerdotal". The request carries a fixed seed, so the same theme, model and language give the same field. It streams the response, because Node's fetch gives up after five minutes without a byte. The field holds `--field-size` words (default 25): the model is asked for 1.5 times that many, the filters trim, and the result is cut to size. The flag is named `--field-size` so it cannot be confused with `--lexic`, and the two cannot be combined. A fixed size was chosen over sizing by transcript length. A short text scoring low is real information, and a field that changed with the transcript would stop being comparable between runs. Temperature 0 and "exactly N words" were tested and rejected (shorter fields, and filler words).

**Considered and not built: embedding-based distinctness** (Ollama's embeddings endpoint, `bge-m3`, cosine 0.75). Prototyped on the same field, it gave the same 31 to 23, needed a second 1.2 GB model, added about 42 s on the slow dev machine, and missed lecture/lecteur. The prefix rule gives the same gain for the padding actually observed, which was morphological, with no synonym clusters seen. The embedding filter is worth revisiting if real runs show synonym clusters padding a field. The numbers are in TODO.md.

- **Thin-field threshold** (`src/theme.ts::THIN_FIELD_THRESHOLD`): fewer than 8 words triggers the thin-field notice, on both the expansion and `--lexic` paths. It is an unconfirmed default like the boundaries and has not been revisited.
- **Terminal graphic sizing** (`src/report.ts`): a 20-character saturation gauge, a 30-character maximum bar width, and a top-10 match cap that collapses the rest into "... and N more". These are cosmetic, low-stakes, undisclosed defaults.

## Language handling (resolved: no theme/transcript mismatch check)

Matching is literal by word boundary, so a field in the wrong language scores 0 and looks like a valid low-saturation finding. The tool once tried to detect that situation by comparing a language guess for the short `--theme` string with the transcript's language, first as a hard stop, then as a confirm prompt, then with a mandatory `--language` flag. All of it rested on `franc-min` classifying short strings, which it does poorly: it confidently mislabels short phrases (for example "patriotism" as Tagalog) and returns "unknown" for most single words. The check rejected valid input and stayed silent when it mattered.

**Current design: prevent the problem and remove the check.** The transcript's language comes from `--language` or from the transcript's own long text (`src/transcriptInput.ts`), which detects reliably. That language goes into the expansion prompt (`src/theme.ts::expandTheme`), which tells the model to write every word in it, even if the theme is given in another language. A `--theme` in a different language than the transcript works, and nothing is left to warn or confirm. `--lexic` wordlists are used as given. The remaining weak point is the model's command of the language, which is why the default model is `qwen2.5:3b` (models under 1B parameters returned unusable French).

The full history of the earlier designs is in git history and in TODO.md's fixed-defects section.

## Why there's no native ML binding in this tool

`at-field` originally transcribed audio itself, locally, through Whisper, and ran theme expansion in-process through `node-llama-cpp`. Both are gone. They were dropped after four severe failures across three different native-binding libraries:

1. **`nodejs-whisper`** compiled whisper.cpp from source on first use (CMake and a C++ compiler) and had no prebuilt fallback. It failed in two ways on two Windows machines: a relative-path bug (fixable, see TODO.md) and an upstream `ggml-cpu.c` / MinGW-w64 headers incompatibility that no change on our side could fix.
2. **`@fugood/whisper.node`** shipped prebuilt binaries and fixed the build problem, but transcription was very slow. A 4:43 clip took 30 minutes on a capable machine (an RTX 3060 gaming rig), where native whisper.cpp should run faster than realtime on any modern CPU. The root cause was never identified. Antivirus interference and a CPU power-plan limit were the leading unconfirmed theories.
3. **GPU acceleration** was added as the suspected fix for the slowness: try the GPU first, fall back to the CPU on error. It worked in a sandbox (a real GPU was detected and used, and the fallback behaved), but on the real hardware it locked up the machine hard enough to need a hard reset. A native GPU-init failure can fail without a catchable JS error, so the fallback never ran. Items 1 to 3 triggered dropping audio and Whisper entirely (see "What this is"). `node-llama-cpp` was kept for theme expansion at that point, because it was a much lighter workload and had not been tied to the lockup.
4. **`node-llama-cpp`** then failed on its own. `expandTheme()` could stall indefinitely on CPU with zero token output. One run was killed after 3 hours, and a retry with a `maxTokens` cap produced nothing after 32 minutes. It made no progress at all, the same "silently stuck, no catchable error" shape as the GPU lockup.

The pattern across the failures pointed at bundling native ML binaries through npm as a shared risk, with no single library at fault. **Resolution: `node-llama-cpp` was replaced by a local Ollama server** (`src/theme.ts`, `POST /api/generate` over HTTP against `OLLAMA_HOST` or `localhost:11434`). Ollama is a separately installed, separately maintained program, so no native code runs inside at-field's process for transcription or expansion. This is the same "bring your own reliable tool" model used for transcripts. Ollama's `ollama pull` replaces the old download-and-cache logic, and at-field offers to run it when a model is missing. A token cap (`num_predict`) stays as a fix in its own right: unbounded generation length was a latent bug whichever backend runs it.

**Retronym, decided and left out of the README and npm page:** "AT" stands for "Alleged Textual" (Field). "Alleged" carries the framing from the core insight (the user suspects a theme, and the tool confirms and quantifies it), and "Textual" reflects the move from audio to text. It stays an internal note on how the name parses.

## Design philosophy

- **Simplicity and good defaults.** Early design required explicit flags for everything, in the name of transparency. That was walked back: the tool needs a working one-liner (`at-field transcript.srt --theme "animals"`) that gives an acceptable result for most users most of the time.
- **Disclosure without gatekeeping.** Quality and limitation signals are printed information, and none blocks a run. The one interactive prompt is the offer to `ollama pull` a missing model, which takes its default when there is no TTY. "Prove you understand" confirmation gates were tried and rejected earlier in the project (the language-mismatch confirm was the last one, now removed). Terminal output has three levels. The default shows the graphic and the report path, with one notes line for limitations that apply to the run (plain-text input, a thin field). `--verbose` adds the full Markdown report and the long notices, and `--quiet` prints only the report path. Constant caveats, such as the transcript's accuracy depending on the tool that made it, live in the report file's Disclaimers section and in `--verbose`, so they do not repeat on every run. Progress and notes go to stderr so stdout can be piped.
- **Local by default.** Theme expansion runs through a local Ollama server, a separate program with no hosted API and no per-run cost. Transcription happens outside the tool, with whatever the user picks, local or hosted.
- **Markdown output.** Other output formats are a later decision.

## Out of scope (v1)

- Summaries of what a text covers, which a summarizer provides.
- A qualitative-research workspace: persistent projects, a manual coding UI, multi-transcript comparison.
- Audio transcription. A transcript comes from another tool.
- Hosting. at-field is a CLI that runs locally.
