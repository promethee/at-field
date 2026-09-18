# at-field

`at-field` takes a transcript you already have and scores how much a theme's lexical field runs through it (e.g. `--theme "animals"`).

```bash
at-field transcript.srt --theme "economy"
```

Bring your own transcript — `whisper.cpp`, a paid transcription service, YouTube captions, whatever already works for you. `at-field` doesn't transcribe anything itself.

## Why an obviousness score

Works best on a theme that *isn't* the transcript's obvious subject — e.g. "economy" running through a nature documentary, or "conflict" through a cooking show. Every run reports an **obviousness score**: high means the theme is basically the stated topic (expected, less interesting), low means it found the theme running quietly underneath.

## Install

Requires Node.js 20+ and [Ollama](https://ollama.com) running locally (theme expansion uses it to build the lexical field — nothing bundled, no API key).

```bash
ollama pull qwen2.5:0.5b
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
| `--obviousness-steps <n>` | `2` | Divide the obviousness score into `n` equal bands (no semantic labels — raw % is always shown too). |

Each run writes a Markdown report next to the input transcript.

## Philosophy

Every limitation (transcript source, thin field, missing timestamps) is printed, never gated behind a confirmation. Theme expansion runs through a local Ollama server — no cloud API calls, no per-run cost. Output is Markdown.

## What this isn't

Not a summarizer. Not a transcription tool — bring your own transcript. Not a research workspace — no saved projects, no cross-run memory. No theme-discovery — you supply `--theme` yourself. One transcript per run: point it at one file, get one report.

## Known limitations

- `--theme` and the transcript must be in the same language — a mismatch is detected and disclosed, and you're asked whether to continue. Language detection (`franc-min`) can *confidently* misdetect short or unusual phrases as the wrong language, not just return a low-confidence "I don't know" — so this is a confirm, not a hard stop, in case it's a false positive.
- Plain-text input has no segment timing, so the report's timestamped-occurrence log will be empty. Use `.srt`/`.vtt` input to keep it.
- Fewer than 8 terms in the expanded lexical field triggers a thin-field notice — results may look more like keyword-spotting than a broad thematic read.

## License

MIT

## Made with AI, designed by human

Built through pairing with Claude Code. Every design decision, trade-off, and rejected alternative is human-made and recorded in `INTENT.md`; the AI handled implementation.
