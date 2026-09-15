# TODO.md

Status: pre-implementation. Repo just created. Nothing built yet.

## v1 scope — transcription pipeline

- [ ] Audio input handling: accept any common format, convert to whatever Whisper needs (resample/format conversion step, likely via ffmpeg)
- [ ] Local Whisper integration (model download, cache check, inference)
- [ ] `--whisper-model=tiny|base|small|medium|large` flag, default via preset
- [ ] First-run download-size confirm, skipped if model already cached
- [ ] `--preset fast|balanced|best` — bundles whisper-model + max-duration + theme-mode defaults per the table in chat history; `best` triggers upfront size/runtime confirm
- [ ] Per-run transcript-quality disclaimer (all modes, always shown — not just low-trust tiers)
- [ ] `--language` flag(s) — default auto-detect, explicit override; decide how this interacts with theme-field expansion language

## v1 scope — theme / lexical analysis

- [ ] `--theme "<value>"` flag (required unless `--lexic` given)
- [ ] Local LLM-based dynamic lexical-field expansion from theme value
- [ ] `--lexic words.txt` — static wordlist override, skips dynamic expansion
- [ ] Thin-field detection: if expanded field is unusually small, decide whether this is still a printed disclaimer or fully replaced by the obviousness-score output (see INTENT.md — leaning toward the latter, not finalized)
- [ ] Obviousness score computation: literal theme-term density in transcript vs. field richness — define exact formula
- [ ] Decide output field name/shape for obviousness score in the Markdown report

## v1 scope — segment / duration handling

- [ ] `--max-duration=<minutes>` flag, sane default (value not yet chosen — was left open, e.g. 60 min candidate)
- [ ] `--max-duration=0` disables cap
- [ ] `--start`/`--end` or `--segment=00:00-30:00` explicit range flags
- [ ] Truncation notice when default cap applies

## v1 scope — output

- [ ] Markdown report generator (only output format for v1)
- [ ] Terminal graphic summary (inline, alongside/independent of the Markdown file)
- [ ] Default output file naming/location convention (not yet decided)

## Explicitly deferred / out of scope for v1

- Theme-discovery mode (no `--theme` given) — rejected, see INTENT.md
- Subject→topic promotion logic — rejected, see INTENT.md
- Non-Markdown output formats (JSON, HTML, PDF)
- Hosted/API-based transcription or theme-expansion fallback
- Multi-transcript / batch processing
- Persistent project/workspace state (ThemeForge-style)

## Docs / project hygiene

- [ ] README.md — needs the "what this is / isn't" framing from INTENT.md, plus a working one-liner example
- [x] Project name: `at-field` (checked clean on npm + PyPI, no meaningful collision)
- [ ] License decision (not yet discussed)
- [ ] Demo / GitHub-page audio set — deferred by request; when picked back up, see chat history for sourcing research (Spoken Wikipedia for "obvious theme" cases, LibriVox for "hidden theme" cases, both EN/FR)

## Open decisions (not yet resolved, need a call before or during implementation)

- Exact `--max-duration` default value
- Exact obviousness-score formula and its output representation
- Whether thin-field warning is separate from or folded into the obviousness score
- Language-flag behavior when transcript language and theme-expansion language differ
- Default output filename/path convention
