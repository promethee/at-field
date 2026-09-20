#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import type { CliOptions } from "./types.js";
import { loadTranscriptFile } from "./transcriptInput.js";
import {
  expandTheme,
  loadLexicFile,
  parseFieldSize,
  DEFAULT_FIELD_SIZE,
  THIN_FIELD_THRESHOLD,
} from "./theme.js";
import { resolveVerbosity, shortNotes, formatNotes, type Verbosity } from "./notes.js";
import { analyze } from "./analyze.js";
import {
  renderMarkdown,
  renderTerminalGraphic,
  DEFAULT_SATURATION_LOW,
  DEFAULT_SATURATION_HIGH,
} from "./report.js";
import { buildOutputPaths } from "./output.js";

interface CliArgs {
  theme?: string;
  lexic?: string;
  language?: string;
  model?: string;
  fieldSize?: string;
  saturationLow: string;
  saturationHigh: string;
  quiet?: boolean;
  verbose?: boolean;
}

const program = new Command();

program
  .name("at-field")
  .description("Text-in, theme-crossed lexical field analysis out.")
  .argument("<transcript>", "path to a transcript file (.srt, .vtt, or plain text)")
  .option("--theme <value>", "theme to expand into a lexical field")
  .option("--lexic <path>", "static wordlist file, overrides dynamic theme expansion")
  .option("--language <code>", "transcript's language, e.g. en, fr -- auto-detected from the transcript if omitted")
  .option("--model <name>", "Ollama model used for theme expansion (default: qwen2.5:3b)")
  .option(
    "--field-size <n>",
    `number of words to keep when the model expands the theme (default: ${DEFAULT_FIELD_SIZE}); not usable with --lexic`,
  )
  .option(
    "--saturation-low <pct>",
    "low boundary for lexical saturation, in percent (see INTENT.md)",
    String(DEFAULT_SATURATION_LOW),
  )
  .option(
    "--saturation-high <pct>",
    "high boundary for lexical saturation, in percent (see INTENT.md)",
    String(DEFAULT_SATURATION_HIGH),
  )
  .option("--quiet", "print only the report path")
  .option("--verbose", "also print the full Markdown report and the long limitation notices")
  .action(async (transcriptArg: string, opts: CliArgs) => {
    // Resolved to absolute immediately -- output paths and the report's
    // filename reference both key off this same value, so it needs to
    // mean the same thing regardless of the user's cwd.
    const transcriptPath = path.resolve(transcriptArg);

    if (!opts.theme) {
      program.error("error: --theme is required (always required; --lexic only changes term sourcing)");
    }

    if (!fs.existsSync(transcriptPath)) {
      program.error(`error: transcript file not found: ${transcriptPath}`);
    }

    const saturationLow = Number(opts.saturationLow);
    const saturationHigh = Number(opts.saturationHigh);
    if (
      !Number.isFinite(saturationLow) ||
      !Number.isFinite(saturationHigh) ||
      saturationLow < 0 ||
      saturationHigh > 100 ||
      saturationLow >= saturationHigh
    ) {
      program.error(
        "error: --saturation-low and --saturation-high must be percentages with 0 <= low < high <= 100",
      );
    }

    if (opts.fieldSize !== undefined && opts.lexic) {
      program.error(
        "error: --field-size sets how many words the model proposes, so it cannot be combined with --lexic " +
          "(your wordlist is used as written)",
      );
    }
    let fieldSize: number | undefined;
    try {
      fieldSize = parseFieldSize(opts.fieldSize);
    } catch (err) {
      program.error(`error: ${(err as Error).message}`);
    }

    let resolved: Verbosity | undefined;
    try {
      resolved = resolveVerbosity(opts);
    } catch (err) {
      program.error(`error: ${(err as Error).message}`);
    }
    const verbosity: Verbosity = resolved ?? "normal";
    // Progress and notes go to stderr so stdout carries only results and can be
    // piped; --quiet silences all of it.
    const info = (line: string) => {
      if (verbosity !== "quiet") console.error(line);
    };
    const detail = (line: string) => {
      if (verbosity === "verbose") console.error(line);
    };

    const options: CliOptions = {
      theme: opts.theme,
      lexic: opts.lexic,
      language: opts.language,
    };

    const transcript = loadTranscriptFile(transcriptPath);

    // --language is optional: if given, it's the explicit ground truth; if
    // omitted, the transcript's own language is detected from its text
    // (src/transcriptInput.ts). Either way it's what expandTheme() is told to
    // write the field in, so a --theme in another language just works -- the
    // old theme-vs-transcript mismatch check was removed as moot.
    const effectiveLanguage = options.language ?? transcript.language;

    detail(
      `Transcript quality disclaimer: user-provided transcript (language: ${effectiveLanguage}) — accuracy ` +
        `depends on whatever tool produced it, not on at-field.`,
    );
    if (transcript.segments.length === 0) {
      detail(
        `No-timestamps disclaimer: plain-text input has no segment timing -- timestamped occurrences will be ` +
          `empty in this report. Use .srt/.vtt input to keep them.`,
      );
    }

    // --- Theme / lexical field ---------------------------------------------
    // --theme is always the analysis anchor. --lexic only swaps how the
    // field's terms are sourced (static file vs. dynamic LLM expansion).

    // Stage message only for the dynamic path -- loading/running a local
    // LLM is the kind of silent wait this disclosure is meant to cover;
    // --lexic's file read is effectively instant and doesn't need one.
    if (!options.lexic) {
      const inLanguage = effectiveLanguage !== "unknown" ? ` (language: ${effectiveLanguage})` : "";
      info(`Expanding theme "${options.theme}" into a lexical field${inLanguage}...`);
    }
    const field = options.lexic
      ? await loadLexicFile(options.lexic, options.theme!)
      : await expandTheme(options.theme!, {
          language: effectiveLanguage !== "unknown" ? effectiveLanguage : undefined,
          model: opts.model,
          size: fieldSize,
        });

    if (field.isThin) {
      detail(
        `Thin-field disclaimer: only ${field.terms.length} term(s) found for "${field.theme}" ` +
          `(threshold: ${THIN_FIELD_THRESHOLD}). Results may resemble keyword-spotting rather than a broad ` +
          `thematic analysis.`,
      );
    }
    if (verbosity === "normal") {
      const notes = formatNotes(
        shortNotes({
          hasTimestamps: transcript.segments.length > 0,
          isThin: field.isThin,
          fieldSize: field.terms.length,
        }),
      );
      if (notes) info(notes);
    }

    // --- Analysis + report ---------------------------------------------

    const result = await analyze(transcript, field);
    const outputPaths = buildOutputPaths(transcriptPath, options.theme!);
    const renderOptions = { saturationLow, saturationHigh, transcriptFileName: path.basename(transcriptPath) };
    const markdown = renderMarkdown(result, renderOptions);

    fs.writeFileSync(outputPaths.reportPath, markdown, "utf-8");

    if (verbosity === "quiet") {
      console.log(outputPaths.reportPath);
      return;
    }
    console.log(renderTerminalGraphic(result, renderOptions));
    if (verbosity === "verbose") console.log(markdown);
    console.log(`\nWritten: ${outputPaths.reportPath}`);
  });

program.parseAsync(process.argv);
