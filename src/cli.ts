#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import type { CliOptions } from "./types.js";
import { loadTranscriptFile } from "./transcriptInput.js";
import { expandTheme, loadLexicFile } from "./theme.js";
import { analyze } from "./analyze.js";
import { renderMarkdown, renderTerminalGraphic, DEFAULT_OBVIOUSNESS_STEPS } from "./report.js";
import { buildOutputPaths } from "./output.js";
import { checkLanguageMatch, detectLanguageCode } from "./language.js";
import { confirm } from "./confirm.js";

const program = new Command();

program
  .name("at-field")
  .description("Text-in, theme-crossed lexical field analysis out.")
  .argument("<transcript>", "path to a transcript file (.srt, .vtt, or plain text)")
  .option("--theme <value>", "theme to expand into a lexical field")
  .option("--lexic <path>", "static wordlist file, overrides dynamic theme expansion")
  .option("--language <code>", "transcript's language, e.g. en, fr -- auto-detected from the transcript if omitted")
  .option(
    "--obviousness-steps <n>",
    "divide the obviousness score into n equal bands (no semantic labels, see INTENT.md)",
    String(DEFAULT_OBVIOUSNESS_STEPS),
  )
  .action(async (transcriptArg: string, opts: Record<string, string>) => {
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

    const options: CliOptions = {
      theme: opts.theme,
      lexic: opts.lexic,
      language: opts.language,
    };

    const transcript = loadTranscriptFile(transcriptPath);

    // --- Language mismatch check ---------------------------------------
    // --language is optional: if given, it's the explicit ground truth;
    // if omitted, the transcript's own detected language is used instead
    // -- detected directly from the real, substantial transcript text
    // (src/transcriptInput.ts), which is far more reliable than the old
    // design's only option (a short --theme string). Either way, the
    // weak link is still the *theme*'s own short-string detection, so a
    // mismatch is disclosed and confirmed rather than blocked outright --
    // franc-min can confidently misdetect short/unusual theme phrases
    // (see INTENT.md). "unknown" (couldn't detect and none given) skips
    // the check entirely -- nothing to compare against.
    const effectiveLanguage = options.language ?? transcript.language;
    if (effectiveLanguage !== "unknown") {
      const match = checkLanguageMatch(options.theme!, effectiveLanguage);
      if (match === "mismatch") {
        const themeLang = detectLanguageCode(options.theme!).code;
        const sourceLabel = options.language ? "is set to" : "was detected as";
        const proceed = await confirm(
          `Language mismatch: --theme "${options.theme}" looks like "${themeLang}", but the transcript ${sourceLabel} ` +
            `"${effectiveLanguage}". Short theme phrases are sometimes misdetected -- try a longer phrase or a ` +
            `synonym, or continue if this is a false positive. Continue anyway?`,
        );
        if (!proceed) {
          console.log("Aborted.");
          process.exitCode = 1;
          return;
        }
      } else if (match === "ambiguous") {
        console.log(
          `Language-match disclaimer: could not confidently detect --theme "${options.theme}"'s language to ` +
            `compare against "${effectiveLanguage}". If matches come back empty, this may be why.`,
        );
      }
    }

    console.log(
      `Transcript quality disclaimer: user-provided transcript (language: ${effectiveLanguage}) — accuracy ` +
        `depends on whatever tool produced it, not on at-field.`,
    );
    if (transcript.segments.length === 0) {
      console.log(
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
      console.log(`Expanding theme "${options.theme}" into a lexical field...`);
    }
    const field = options.lexic
      ? await loadLexicFile(options.lexic, options.theme!)
      : await expandTheme(options.theme!, {
          language: effectiveLanguage !== "unknown" ? effectiveLanguage : undefined,
        });

    if (field.isThin) {
      console.log(
        `Thin-field disclaimer: only ${field.terms.length} term(s) found for "${field.theme}" ` +
          `(threshold: 8). Results may resemble keyword-spotting rather than a broad thematic analysis.`,
      );
    }

    // --- Analysis + report ---------------------------------------------

    const result = await analyze(transcript, field);
    const obviousnessSteps = Number(opts.obviousnessSteps) || DEFAULT_OBVIOUSNESS_STEPS;
    const outputPaths = buildOutputPaths(transcriptPath, options.theme!);
    const renderOptions = { obviousnessSteps, transcriptFileName: path.basename(transcriptPath) };
    const markdown = renderMarkdown(result, renderOptions);

    fs.writeFileSync(outputPaths.reportPath, markdown, "utf-8");

    console.log(renderTerminalGraphic(result, renderOptions));
    console.log(markdown);
    console.log(`\nWritten: ${outputPaths.reportPath}`);
  });

program.parseAsync(process.argv);
