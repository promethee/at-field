#!/usr/bin/env node
import { Command } from "commander";
import { PRESETS, resolvePreset, type PresetName } from "./presets.js";
import type { CliOptions } from "./types.js";
import { transcribe, isModelCached } from "./transcribe.js";
import { expandTheme, loadLexicFile } from "./theme.js";
import { analyze } from "./analyze.js";
import { renderMarkdown, renderTerminalGraphic } from "./report.js";

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
  .action(async (audio: string, opts: Record<string, string>) => {
    if (!opts.theme && !opts.lexic) {
      program.error("error: one of --theme or --lexic is required");
    }

    const preset = resolvePreset((opts.preset as PresetName) ?? "fast");

    const options: CliOptions = {
      audioPath: audio,
      theme: opts.theme,
      lexic: opts.lexic,
      preset: (opts.preset as PresetName) ?? "fast",
      whisperModel: (opts.whisperModel as CliOptions["whisperModel"]) ?? preset.whisperModel,
      maxDuration: opts.maxDuration ? Number(opts.maxDuration) : preset.maxDuration,
      language: opts.language,
    };

    // NOT IMPLEMENTED past this point — pipeline wiring only.
    // Real flow: (1) model-cache check + confirm, (2) transcribe,
    // (3) expand theme or load --lexic, (4) analyze, (5) render + print.
    console.log("at-field: parsed options (pipeline not yet implemented):");
    console.log(options);

    void isModelCached;
    void transcribe;
    void expandTheme;
    void loadLexicFile;
    void analyze;
    void renderMarkdown;
    void renderTerminalGraphic;
    void PRESETS;
  });

program.parseAsync(process.argv);
