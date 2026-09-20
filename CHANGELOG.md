# Changelog

## 0.1.1 (2026-09-20)

- Added `--version` (`-V`).
- The pull prompt shows the download size before offering to pull a missing model, a run with no terminal starts no download, and expected failures print one error line instead of a stack trace. These were in the repository at the `v0.1.0` tag but missing from the published 0.1.0 package: it was built from an older `dist/`, because the build step did not run at publish time.
- Reworded the limitation notices and the report's disclaimers in plain statements.
- Wrote `bin` without the leading `./`, which silences an npm warning at publish time.
- Pointed the package `homepage` at the project page.
- The tarball check now fails when a built file is missing or older than its source.

## 0.1.0 (2026-09-20)

First release.

- Measures how much of a theme's vocabulary a transcript uses, and reports a lexical saturation score with raw counts, a matches-per-1,000-words density and its position against two adjustable boundaries.
- Accepts `.srt`, `.vtt` and plain text. Theme expansion runs through a local Ollama server, with the field written in the transcript's language.
- Flags: `--theme`, `--lexic`, `--language`, `--model`, `--field-size`, `--stem-length`, `--saturation-low`, `--saturation-high`, `--verbose`, `--quiet`.
- Default output is the graphic, one notes line when a limitation applies, and the report path. `--verbose` adds the full Markdown report, and `--quiet` prints only the path.
- Offers to `ollama pull` a missing model.
