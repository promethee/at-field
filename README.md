# at-field

`at-field` transcribes audio and scores how much a theme's lexical field runs through it (e.g. `--theme "animals"`).

```bash
at-field podcast.mp3 --theme "economy" --language en
```

Built to be simple by default — one command, working presets — while still letting you dial in specifics (theme source, language, time range) when needed.

## Why an obviousness score

Works best on a theme that *isn't* the audio's obvious subject — e.g. "economy" running through a nature documentary, or "conflict" through a cooking show. Every run reports an **obviousness score**: high means the theme is basically the stated topic (expected, less interesting), low means it found the theme running quietly underneath.

## Install

Requires Node.js 20+ and `ffmpeg`/`ffprobe` on your `PATH`.

```bash
git clone https://github.com/promethee/at-field.git
cd at-field
npm install
npm run build
npm link
```

First run downloads a local Whisper model (size depends on `--whisper-model`); you'll be asked to confirm.

## Usage

```bash
at-field <audio-file> --theme "<theme>" [options]
```

| Flag | Default | Description |
|---|---|---|
| `--theme <value>` | *(required)* | Theme to expand into a lexical field and score against the transcript. |
| `--lexic <path>` | — | Static wordlist file instead of dynamic theme expansion. `--theme` still anchors the analysis. |
| `--preset <name>` | `fast` | `fast` \| `balanced` \| `best` — bundles `--whisper-model` + `--max-duration`. |
| `--whisper-model <model>` | via preset | `tiny` \| `base` \| `small` \| `medium` \| `large`. Overrides preset. |
| `--max-duration <minutes>` | via preset | Cap on audio analyzed, `0` = unlimited. |
| `--start <time>` | start of audio | Range start: seconds, `MM:SS`, or `HH:MM:SS`. |
| `--end <time>` | end of audio | Range end, same format as `--start`. |
| `--language <code>` | *(required)* | Audio's language, e.g. `en`, `fr`. No auto-detect — see Known Limitations for why. Checked against `--theme`'s detected language. |
| `--obviousness-steps <n>` | `2` | Divide the obviousness score into `n` equal bands (no semantic labels — raw % is always shown too). |

Each run writes a Markdown report and a transcript file next to the input audio.

## Philosophy

Every limitation (transcript quality, thin field, duration cap) is printed, never gated behind a confirmation. Everything runs locally — no API calls, no per-run cost. Output is Markdown.

## What this isn't

Not a summarizer. Not a research workspace — no saved projects, no cross-run memory. No theme-discovery — you supply `--theme` yourself. One audio file per run: point it at one file, get one report.

## Known limitations

- **Why isn't the audio's language auto-detected?** Because the language-detection library this tool uses for `--theme` (`franc-min`) can *confidently* misdetect short or unusual phrases as the wrong language — not just return a low-confidence "I don't know." Layering that same unreliable detector onto the audio's language too (instead of asking you) would compound the risk for no real benefit — and an explicit language also gives Whisper a real hint instead of relying on its own auto-detection, which improves transcription accuracy. So `--language` is required, not guessed.
- `--theme` and the audio must be in the same language — a mismatch is detected and disclosed, and you're asked whether to continue (in case it's a false positive from the limitation above rather than a real mismatch).
- Fewer than 8 terms in the expanded lexical field triggers a thin-field notice — results may look more like keyword-spotting than a broad thematic read.

## License

MIT

## Made with AI, designed by human

Built through pairing with Claude Code. Every design decision, trade-off, and rejected alternative is human-made and recorded in `INTENT.md`; the AI handled implementation.
