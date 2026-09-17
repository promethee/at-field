import fs from "node:fs";
import path from "node:path";
import { nodewhisper } from "nodejs-whisper";
// Deep import: nodejs-whisper has no "exports" map, so subpath imports are
// allowed. Used to replicate its own cache-check logic without transcribing.
import { WHISPER_CPP_PATH, MODEL_OBJECT } from "nodejs-whisper/dist/constants.js";
import { extractWhisperDetectedLanguage } from "./language.js";

import type { CliOptions, TranscriptResult, TranscriptSegment } from "./types.js";

export type WhisperModelName = keyof typeof MODEL_OBJECT;

/**
 * Checks whether the given Whisper model's weights are already downloaded
 * locally. Mirrors nodejs-whisper's own autoDownloadModel() existence check
 * so the CLI can decide whether to show the first-run download-size confirm
 * *before* invoking transcription.
 */
export async function isModelCached(model: string): Promise<boolean> {
  const filename = MODEL_OBJECT[model as WhisperModelName];
  if (!filename) {
    throw new Error(
      `Unknown whisper model "${model}". Valid: ${Object.keys(MODEL_OBJECT).join(", ")}`,
    );
  }
  const modelPath = path.join(WHISPER_CPP_PATH, "models", filename);
  return fs.existsSync(modelPath);
}

// Matches whisper.cpp's default stdout segment format, e.g.:
// [00:00:00.000 --> 00:00:04.320]   some segment text
const SEGMENT_LINE = /^\[(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})\][ \t]*(.*)$/;

function timeToSeconds(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

/**
 * Parses whisper.cpp's default timestamped stdout into segments. This is
 * the CLI's own default output format (no special flag needed) -- avoids
 * depending on a separate JSON/SRT output file.
 *
 * Matched line-by-line rather than with a single multi-line regex: a
 * trailing `\s*` before the text capture will otherwise cross the newline
 * into the next line (caught by a regression test) since `\s` matches
 * line breaks.
 */
export function parseWhisperOutput(stdout: string): Pick<TranscriptResult, "text" | "segments"> {
  const segments: TranscriptSegment[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = SEGMENT_LINE.exec(line.trim());
    if (!match) continue;
    const [, h1, m1, s1, ms1, h2, m2, s2, ms2, text] = match;
    const trimmed = text.trim();
    if (!trimmed) continue;
    segments.push({
      start: timeToSeconds(h1, m1, s1, ms1),
      end: timeToSeconds(h2, m2, s2, ms2),
      text: trimmed,
    });
  }
  return {
    text: segments.map((s) => s.text).join(" "),
    segments,
  };
}

/**
 * Converts the input audio (any format nodejs-whisper/ffmpeg can read) and
 * runs local Whisper inference. Model download (if not cached) is delegated
 * to nodejs-whisper via autoDownloadModelName -- call isModelCached() first
 * if a confirm prompt is required before downloading.
 */
export async function transcribe(
  options: Pick<CliOptions, "audioPath" | "whisperModel" | "language">,
): Promise<TranscriptResult> {
  const model = options.whisperModel ?? "base";

  if (!fs.existsSync(options.audioPath)) {
    throw new Error(`Audio file not found: ${options.audioPath}`);
  }

  const requestedLanguage = options.language ?? "auto";

  // whisper.cpp writes its auto-detected-language line to stderr, which
  // nodejs-whisper only exposes via a custom logger's debug() (its own
  // returned stdout never contains it). Capture that here so
  // TranscriptResult.language reflects what Whisper actually detected in
  // auto mode, not just the string we requested.
  const capturedLogLines: string[] = [];
  const captureLogger = {
    debug: (...args: unknown[]) => capturedLogLines.push(args.map(String).join(" ")),
    log: (...args: unknown[]) => capturedLogLines.push(args.map(String).join(" ")),
    error: (...args: unknown[]) => capturedLogLines.push(args.map(String).join(" ")),
  };

  // No outputInText/outputInJson flag set: whisper.cpp's default stdout
  // already includes per-segment timestamps, which parseWhisperOutput()
  // reads directly -- avoids managing a second output file.
  const stdout = await nodewhisper(options.audioPath, {
    modelName: model,
    autoDownloadModelName: model,
    removeWavFileAfterTranscription: true,
    logger: captureLogger,
    whisperOptions: {
      language: requestedLanguage,
    },
  });

  const { text, segments } = parseWhisperOutput(stdout);
  const detectedLanguage =
    requestedLanguage === "auto"
      ? (extractWhisperDetectedLanguage(capturedLogLines) ?? "auto")
      : requestedLanguage;

  return {
    text,
    segments,
    source: "model",
    language: detectedLanguage,
    // Duration-cap / segment-range trimming both happen before transcribe()
    // is called (see src/audio.ts + cli.ts) -- transcribe() itself is
    // unaware of either. The caller attaches the real values afterward.
    durationCap: null,
    segmentRange: null,
  };
}
