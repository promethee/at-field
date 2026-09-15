# AGENTS.md

Rules for any AI agent (Claude Code, Copilot, etc.) working in this repo.

## Output style: extreme conciseness

- Lead with the action, not context-setting. First line = what to do or what changed.
- Number steps for anything multi-step. No prose transitions between them.
- One next step at the end. Never zero, never more than one.
- Strip tangents, hedges, and "by the way" asides unless they block the current step.
- On multi-turn tasks, restate state (done / pending) in one line at the top of the turn — don't recap in paragraph form.
- Use concrete units: file paths, line numbers, exact commands, exact flag names — never "shortly," "soon," or "some changes."
- Flag completed work in a single line. Don't narrate the win.
- Report errors as: what failed → why → next command. No apology, no softening.
- Cap lists at 5 items. If there are more, group them or state the count and defer the rest.
- No preamble ("Sure, I can help with that"), no restating the request, no closing filler ("Let me know if you need anything else!").
- File content (code, generated docs) stays complete and uncompressed. Conciseness governs commentary about the file, not the file itself.

## Non-negotiable exception

Conciseness never overrides correctness. If a caveat, risk, or ambiguity actually changes what the maintainer should do, state it — briefly, in one line — rather than omitting it to hit a length target.

## Project-specific rules (read INTENT.md first for the "why")

- **No silent defaults.** Every flag that changes output must have a stated, documented default. Never assume a value without disclosing it in `--help` output and README.
- **No "prove you understand" gates.** Never add a flag whose only purpose is to make the user type a phrase acknowledging a risk (e.g. `--i-understand-x`). Disclosure = print the info. Consent = require the user to pass the actual parameter that encodes their choice (e.g. `--whisper-model=medium`), not a separate confirmation string.
- **Interactive confirms are for real one-time costs only** — first-time model download size, `--preset best` runtime/size estimate. Not for routine runs.
- **Presets (`--preset fast|balanced|best`) bundle complexity.** Individual flags (`--whisper-model`, `--max-duration`, etc.) still override a preset's value if explicitly set.
- **Local-only for v1.** No external API calls for transcription (Whisper local) or theme expansion (local LLM only). Don't add a hosted-API path without an explicit decision to do so.
- **Markdown is the only output format for v1.** Don't add JSON/HTML/PDF export until asked.
- **Stack: TypeScript-first**, JS-centered. Only reach for another language with a stated, justified reason (see CLAUDE.md preferences).
- **Disclaimers are non-blocking.** Every transcript-quality and pertinence disclaimer (obviousness score, thin-field warning) prints alongside output — it never halts execution or requires a flag to bypass.
- **Don't build theme-discovery mode.** Explicitly rejected — out of scope for v1, see INTENT.md.
- **Don't build subject→topic "promotion" logic.** Explicitly rejected as circular — see INTENT.md.

## Before adding a flag or feature

Ask: does this serve the core pipeline (audio → transcript → theme-crossed lexical analysis), or is it adjacent scope creep toward a qualitative-research workspace (ThemeForge territory)? If adjacent, don't build it without an explicit go-ahead.
