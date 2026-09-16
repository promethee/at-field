#!/usr/bin/env node
import { Command } from "commander";
import { PRESETS, resolvePreset, type PresetName } from "./presets.js";
import type { CliOptions } from "./types.js";
import { transcribe, isModelCached } from "./transcribe.js";
import { expandTheme, loadLexicFile } from "./theme.js";
import { analyze } from "./analyze.js";
import { renderMarkdown, renderTerminalGraphic, DEFAULT_OBVIOUSNESS_STEPS } from "./report.js";
import { confirm, APPROX_MODEL_SIZE_MB } from "./confirm.js";

const program = new Command();

program
  .name("at-field")
  .description("Local audio in, theme-crossed lexical field analysis out.")
  .argument("<audio>", "path to a local audio file")
  .option("--theme <value>", "theme to expand into a lexical field")
  .option("--lexic <path>", "static wordlist file, overrides dynamic theme expansion")
  .option("--preset <name>", "fast | balanced | best", "fast")
  .option("--whisper-model <model>", "tiny | base | small | medium | large (overrides preset)")
  .option("--max-duration <minutes>", "cap in minutes, 0 = unlimited (overrides preset)")
  .option("--language <code>", "transcript language, default auto-detect")
  .option(
    "--obviousness-steps <n>",
    "divide the obviousness score into n equal bands (no semantic labels, see INTENT.md)",
    String(DEFAULT_OBVIOUSNESS_STEPS),
  )
  .action(async (audio: string, opts: Record<string, string>) => {
    if (!opts.theme) {
      program.error("error: --theme is required (always required; --lexic only changes term sourcing)");
    }

    const presetName = (opts.preset as PresetName) ?? "fast";
    const preset = resolvePreset(presetName);

    const options: CliOptions = {
      audioPath: audio,
      theme: opts.theme,
      lexic: opts.lexic,
      preset: presetName,
      whisperModel: (opts.whisperModel as CliOptions["whisperModel"]) ?? preset.whisperModel,
      maxDuration: opts.maxDuration ? Number(opts.maxDuration) : preset.maxDuration,
      language: opts.language,
    };

    // --- Confirm gates ---------------------------------------------------

    // 1. Preset "best" confirm: uncapped duration + heaviest default model.
    //    Non-blocking philosophy still applies -- this is a one-time cost
    //    decision (see AGENTS.md), not a "prove you understand" flag.
    if (preset.requiresUpfrontConfirm) {
      const approxSize = APPROX_MODEL_SIZE_MB[options.whisperModel!] ?? "unknown";
      const proceed = await confirm(
        `--preset best runs uncapped duration with the "${options.whisperModel}" model ` +
          `(~${approxSize} MB if not already downloaded). This can take a long time on long audio. Continue?`,
      );
      if (!proceed) {
        console.log("Aborted.");
        process.exitCode = 0;
        return;
      }
    }

    // 2. Model-download confirm: only if the resolved whisper model isn't
    //    cached yet. Applies regardless of preset.
    const whisperCached = await isModelCached(options.whisperModel!);
    if (!whisperCached) {
      const approxSize = APPROX_MODEL_SIZE_MB[options.whisperModel!] ?? "unknown";
      const proceed = await confirm(
        `Whisper model "${options.whisperModel}" (~${approxSize} MB) is not downloaded yet. Download now?`,
        true,
      );
      if (!proceed) {
        console.log("Aborted — no model downloaded.");
        process.exitCode = 1;
        return;
      }
    }

    // --- Transcription -----------------------------------------------------

    console.log(`Transcribing "${audio}" with model "${options.whisperModel}"...`);
    const transcript = await transcribe(options);
    console.log(
      `Transcript quality disclaimer: local Whisper output (source: ${transcript.source}) — ` +
        `accuracy depends on model size and audio quality.`,
    );

    // --- Theme / lexical field ---------------------------------------------
    // --theme is always the analysis anchor. --lexic only swaps how the
    // field's terms are sourced (static file vs. dynamic LLM expansion).

    const field = options.lexic
      ? await loadLexicFile(options.lexic, options.theme!)
      : await expandTheme(options.theme!);

    if (field.isThin) {
      console.log(
        `Thin-field disclaimer: only ${field.terms.length} term(s) found for "${field.theme}" ` +
          `(threshold: 8). Results may resemble keyword-spotting rather than a broad thematic analysis.`,
      );
    }

    // --- Analysis + report ---------------------------------------------
    // NOT IMPLEMENTED past this point (analyze.ts, report.ts are stubs).

    const result = await analyze(transcript, field);
    const obviousnessSteps = Number(opts.obviousnessSteps) || DEFAULT_OBVIOUSNESS_STEPS;
    const renderOptions = { obviousnessSteps };
    const markdown = renderMarkdown(result, renderOptions);
    console.log(renderTerminalGraphic(result, renderOptions));
    console.log(markdown);

    void PRESETS;
  });

program.parseAsync(process.argv);
