#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { PRESETS, resolvePreset, type PresetName } from "./presets.js";
import type { CliOptions, TranscriptResult } from "./types.js";
import { transcribe, isModelCached, ensureModelDownloaded } from "./transcribe.js";
import { trimToMaxDuration, trimToRange, parseTimeToSeconds, type RangeTrimResult } from "./audio.js";
import { expandTheme, loadLexicFile } from "./theme.js";
import { analyze } from "./analyze.js";
import { renderMarkdown, renderTerminalGraphic, formatTimestamp, DEFAULT_OBVIOUSNESS_STEPS } from "./report.js";
import { buildOutputPaths, findExistingTranscript } from "./output.js";
import { checkLanguageMatch } from "./language.js";
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
  .option("--start <time>", "start of the range to analyze, e.g. 90, 01:30, or 00:01:30 (default: start of audio)")
  .option("--end <time>", "end of the range to analyze, same format as --start (default: end of audio)")
  .option("--language <code>", "transcript language, default auto-detect")
  .option(
    "--obviousness-steps <n>",
    "divide the obviousness score into n equal bands (no semantic labels, see INTENT.md)",
    String(DEFAULT_OBVIOUSNESS_STEPS),
  )
  .action(async (audioArg: string, opts: Record<string, string>) => {
    // Resolved to absolute immediately -- output paths, transcript reuse,
    // and range/duration trimming all key off this same value, so it needs
    // to mean the same thing regardless of the user's cwd.
    const audio = path.resolve(audioArg);

    if (!opts.theme) {
      program.error("error: --theme is required (always required; --lexic only changes term sourcing)");
    }

    const presetName = (opts.preset as PresetName) ?? "fast";
    const preset = resolvePreset(presetName);

    // --- --start/--end parsing --------------------------------------------
    // Free, instant validation -- runs before any confirm gates for the same
    // reason as the explicit --language check below.
    let startSeconds: number | null = null;
    let endSeconds: number | null = null;
    try {
      if (opts.start) startSeconds = parseTimeToSeconds(opts.start);
      if (opts.end) endSeconds = parseTimeToSeconds(opts.end);
    } catch (err) {
      program.error(`error: ${(err as Error).message}`);
    }
    if (startSeconds !== null && endSeconds !== null && endSeconds <= startSeconds) {
      program.error(`error: --end (${opts.end}) must be after --start (${opts.start})`);
    }

    const options: CliOptions = {
      audioPath: audio,
      theme: opts.theme,
      lexic: opts.lexic,
      preset: presetName,
      whisperModel: (opts.whisperModel as CliOptions["whisperModel"]) ?? preset.whisperModel,
      maxDuration: opts.maxDuration ? Number(opts.maxDuration) : preset.maxDuration,
      language: opts.language,
      startSeconds,
      endSeconds,
    };

    // --- Language mismatch check (explicit --language only) ---------------
    // Runs first, before any confirm gates: it's a free, instant check that
    // can invalidate the whole invocation, so it shouldn't happen after the
    // user's already been asked to confirm a model download. If --language
    // is set explicitly, the user already stated ground truth, so a clear
    // mismatch is an error in the invocation itself -- hard stop. Ambiguous
    // detection (short --theme strings often are) only warns.
    // --language=auto can't be checked here -- Whisper hasn't run yet, so
    // there's nothing to compare against; that case is checked after
    // transcription instead.
    if (options.language && options.language !== "auto") {
      const match = checkLanguageMatch(options.theme!, options.language);
      if (match === "mismatch") {
        program.error(
          `error: --theme "${options.theme}" appears to be in a different language than ` +
            `--language=${options.language}. Lexical matching relies on --theme and the transcript ` +
            `being in the same language -- rerun with --theme written in that language, or correct --language.`,
        );
      } else if (match === "ambiguous") {
        console.log(
          `Language-match disclaimer: could not confidently detect --theme "${options.theme}"'s language ` +
            `to compare against --language=${options.language}. If matches come back empty, this may be why.`,
        );
      }
    }

    // --- Implicit transcript-artifact reuse ---------------------------
    // Checked before any Whisper-related confirm gates/transcription, so
    // accepting reuse skips their cost entirely -- not just the transcribe
    // call. No new flag: this reads back a file the tool's own output
    // convention already produces (see INTENT.md / TODO.md).
    let transcript: TranscriptResult | null = null;
    let transcriptFileNameForReport: string | null = null;
    let shouldWriteTranscriptFile = true;

    const existing = findExistingTranscript(audio, options.theme!);
    if (existing) {
      const reuse = await confirm(
        `Found an existing transcript from a previous run: ${existing.fileName}. ` +
          `Reuse it instead of re-transcribing? (delete the file to force re-transcription)`,
        true,
      );
      if (reuse) {
        console.log(
          `Reusing existing transcript from ${existing.path} — delete it to force re-transcription. ` +
            `Note: reused transcripts have no saved segment timestamps or language metadata -- ` +
            `timestamped occurrences will be empty in this report, and the language-mismatch check ` +
            `is skipped this run.`,
        );
        if (options.startSeconds !== null || options.endSeconds !== null) {
          console.log(
            `Note: --start/--end are ignored when reusing an existing transcript, since transcription itself ` +
              `is skipped entirely -- delete the transcript file to force a re-transcription that honors them.`,
          );
        }
        transcript = {
          text: fs.readFileSync(existing.path, "utf-8"),
          source: "model",
          language: "unknown",
          segments: [],
          durationCap: null,
          segmentRange: null,
        };
        transcriptFileNameForReport = existing.fileName;
        shouldWriteTranscriptFile = false;
      }
    }

    // --- Confirm gates ---------------------------------------------------
    // Skipped entirely when a transcript was reused above.

    if (!transcript) {
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
        console.log(`Downloading whisper model "${options.whisperModel}"...`);
      }
      await ensureModelDownloaded(options.whisperModel!);

      // --- Segment range (--start/--end) ------------------------------
      // Extracted *before* transcription and before the duration cap, so a
      // ranged run doesn't pay transcription cost for audio outside the
      // requested range. Independent of --max-duration: the cap below then
      // applies to this range's own duration, not the original file's.

      let rangeTrim: RangeTrimResult;
      try {
        rangeTrim = await trimToRange(audio, options.startSeconds ?? null, options.endSeconds ?? null);
      } catch (err) {
        program.error(`error: ${(err as Error).message}`);
        return;
      }
      if (rangeTrim.trimmed) {
        const startLabel = formatTimestamp(rangeTrim.range!.startSeconds);
        const endLabel =
          rangeTrim.range!.endSeconds !== null ? formatTimestamp(rangeTrim.range!.endSeconds) : "end of audio";
        console.log(
          `Segment range disclaimer: analyzing ${startLabel}–${endLabel} only (--start/--end). ` +
            `Content outside this range was not analyzed.`,
        );
      }

      // --- Duration cap ----------------------------------------------------
      // Trimmed *before* transcription (not after) so a capped run doesn't
      // pay transcription cost for the discarded portion. --max-duration=0
      // (or unset via preset) disables this entirely.

      const trim = await trimToMaxDuration(rangeTrim.path, options.maxDuration ?? 0);
      if (trim.trimmed) {
        const originalMin = (trim.originalSeconds / 60).toFixed(1);
        const cappedMin = (trim.cappedSeconds! / 60).toFixed(1);
        console.log(
          `Duration cap disclaimer: audio is ${originalMin} min, trimmed to the first ${cappedMin} min ` +
            `before transcription (--max-duration=${options.maxDuration}; use --max-duration=0 to disable). ` +
            `Content beyond this point was not analyzed.`,
        );
      }

      // --- Transcription -----------------------------------------------
      // Prints the audio duration actually being transcribed (a known
      // fact, not a time-to-complete guess) so a long run doesn't look
      // identical to a stuck one -- see INTENT.md's "stage-transition
      // terminal disclosure" note.

      const transcribeDurationMin = ((trim.trimmed ? trim.cappedSeconds! : trim.originalSeconds) / 60).toFixed(1);
      console.log(`Transcribing ${transcribeDurationMin} min of audio with model "${options.whisperModel}"...`);
      transcript = await transcribe({ ...options, audioPath: trim.path });
      trim.cleanup();
      rangeTrim.cleanup();
      transcript.durationCap = trim.trimmed
        ? { originalSeconds: trim.originalSeconds, cappedSeconds: trim.cappedSeconds! }
        : null;
      transcript.segmentRange = rangeTrim.range;
      if (rangeTrim.range) {
        // Whisper's segment timestamps are relative to the extracted clip
        // (0-based) -- offset them back to the original audio's timeline so
        // the report's timestamped occurrences remain meaningful absolute
        // positions, not confusing clip-relative ones.
        const offset = rangeTrim.range.startSeconds;
        transcript.segments = transcript.segments.map((s) => ({
          ...s,
          start: s.start + offset,
          end: s.end + offset,
        }));
      }
      console.log(
        `Transcript quality disclaimer: local Whisper output (source: ${transcript.source}) — ` +
          `accuracy depends on model size and audio quality.`,
      );
    }

    // Output paths are always fresh (new UUID) for the report; the
    // transcript file is only (re)written when this run actually
    // transcribed -- a reused transcript keeps its original filename,
    // referenced directly in the report instead of being duplicated.
    const outputPaths = buildOutputPaths(audio, options.theme!);
    if (shouldWriteTranscriptFile) {
      fs.writeFileSync(outputPaths.transcriptPath, transcript.text, "utf-8");
      transcriptFileNameForReport = outputPaths.transcriptFileName;
    }

    // --- Language mismatch check (--language=auto case) ---------------
    // Only reachable when --language was auto/unset AND this run actually
    // transcribed (transcript.language now holds Whisper's real detected
    // code -- see transcribe.ts). Skipped for a reused transcript, which
    // has no saved language metadata to check against (disclosed above).
    // Checked before analysis/report so a mismatch never produces a
    // misleading near-all-zero-matches result -- transcription cost is
    // already spent either way, so stopping here still prevents a bad
    // output from reaching the user. See INTENT.md for why this can't be
    // checked earlier.
    if (
      shouldWriteTranscriptFile &&
      (!options.language || options.language === "auto") &&
      transcript.language !== "auto"
    ) {
      const match = checkLanguageMatch(options.theme!, transcript.language);
      if (match === "mismatch") {
        console.log(
          `error: --theme "${options.theme}" appears to be in a different language than the audio ` +
            `(detected: ${transcript.language}). Lexical matching relies on --theme and the transcript ` +
            `being in the same language. The transcript was already written to ${outputPaths.transcriptPath} ` +
            `and will be offered for reuse on your next run with this audio+theme. Rerun with --theme ` +
            `written in the audio's language, or set --language explicitly.`,
        );
        process.exitCode = 1;
        return;
      } else if (match === "ambiguous") {
        console.log(
          `Language-match disclaimer: could not confidently detect --theme "${options.theme}"'s language ` +
            `to compare against the audio's detected language (${transcript.language}). If matches come ` +
            `back empty, this may be why.`,
        );
      }
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
      : await expandTheme(options.theme!);

    if (field.isThin) {
      console.log(
        `Thin-field disclaimer: only ${field.terms.length} term(s) found for "${field.theme}" ` +
          `(threshold: 8). Results may resemble keyword-spotting rather than a broad thematic analysis.`,
      );
    }

    // --- Analysis + report ---------------------------------------------

    const result = await analyze(transcript, field);
    const obviousnessSteps = Number(opts.obviousnessSteps) || DEFAULT_OBVIOUSNESS_STEPS;
    const renderOptions = { obviousnessSteps, transcriptFileName: transcriptFileNameForReport ?? undefined };
    const markdown = renderMarkdown(result, renderOptions);

    fs.writeFileSync(outputPaths.reportPath, markdown, "utf-8");

    console.log(renderTerminalGraphic(result, renderOptions));
    console.log(markdown);
    console.log(`\nWritten: ${outputPaths.reportPath}`);
    if (shouldWriteTranscriptFile) {
      console.log(`Written: ${outputPaths.transcriptPath}`);
    }

    void PRESETS;
  });

program.parseAsync(process.argv);
