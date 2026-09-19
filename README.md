# at-field

`at-field` takes a transcript you already have and scores how much a theme's lexical field runs through it (e.g. `--theme "animals"`).

```bash
at-field transcript.srt --theme "economy"
```

Bring your own transcript — `whisper.cpp`, a paid transcription service, YouTube captions, whatever already works for you. `at-field` doesn't transcribe anything itself.

## Reading the score

Every run reports a **lexical saturation** score: how much of the theme's vocabulary shows up in the transcript (distinct field terms found ÷ field size), with the raw counts and a matches-per-1,000-words density beside it. Works best on a theme that *isn't* the transcript's obvious subject — e.g. "economy" running through a nature documentary, or "conflict" through a cooking show.

The report says whether the score sits below, between, or above two boundaries (default 10% and 70%). The defaults are arbitrary — set your own with `--saturation-low` / `--saturation-high`. What a position means is up to you.

## Install

Requires Node.js 22+ and [Ollama](https://ollama.com) running locally (theme expansion uses it to build the lexical field — nothing bundled, no API key).

```bash
ollama pull qwen2.5:3b
git clone https://github.com/promethee/at-field.git
cd at-field
npm install
npm run build
npm link
```

`at-field` talks to Ollama's default local server (`http://localhost:11434`); override with the `OLLAMA_HOST` env var if yours runs elsewhere.

## Usage

```bash
at-field <transcript-file> --theme "<theme>" [options]
```

Accepts `.srt`, `.vtt` (timestamps preserved in the report), or plain text (no timestamps).

| Flag | Default | Description |
|---|---|---|
| `--theme <value>` | *(required)* | Theme to expand into a lexical field and score against the transcript. |
| `--lexic <path>` | — | Static wordlist file instead of dynamic theme expansion. `--theme` still anchors the analysis. |
| `--language <code>` | auto-detected from transcript | Transcript's language, e.g. `en`, `fr`. Checked against `--theme`'s detected language. |
| `--model <name>` | `qwen2.5:3b` | Ollama model for theme expansion. Offers to `ollama pull` it if missing. Smaller models (e.g. `qwen2.5:0.5b`) are faster but give poor fields outside English; larger ones (e.g. `mistral`) may do better in French. |
| `--saturation-low <pct>` | `10` | Low boundary for the saturation score, in percent. |
| `--saturation-high <pct>` | `70` | High boundary for the saturation score, in percent. |

Each run writes a Markdown report next to the input transcript.

## Philosophy

Every limitation (transcript source, thin field, missing timestamps) is printed, never gated behind a confirmation. Theme expansion runs through a local Ollama server — no cloud API calls, no per-run cost. Output is Markdown.

## What this isn't

Not a summarizer. Not a transcription tool — bring your own transcript. Not a research workspace — no saved projects, no cross-run memory. No theme-discovery — you supply `--theme` yourself. One transcript per run: point it at one file, get one report.

## Known limitations

- The lexical field is written in the transcript's language (auto-detected, or set with `--language`), so `--theme` can be in any language. How good that field is depends on the model: small models are weak outside English, hence the `qwen2.5:3b` default.
- Plain-text input has no segment timing, so the report's timestamped-occurrence log will be empty. Use `.srt`/`.vtt` input to keep it.
- Fewer than 8 terms in the expanded lexical field triggers a thin-field notice — results may look more like keyword-spotting than a broad thematic read.

## License

MIT

## Made with AI, designed by human

Built through pairing with Claude Code. Every design decision, trade-off, and rejected alternative is human-made and recorded in `INTENT.md`; the AI handled implementation.
