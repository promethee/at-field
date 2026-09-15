import fs from "node:fs";
import path from "node:path";
import { nodewhisper } from "nodejs-whisper";
// Deep import: nodejs-whisper has no "exports" map, so subpath imports are
// allowed. Used to replicate its own cache-check logic without transcribing.
import { WHISPER_CPP_PATH, MODEL_OBJECT } from "nodejs-whisper/dist/constants.js";

import type { CliOptions, TranscriptResult } from "./types.js";

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

  const text = await nodewhisper(options.audioPath, {
    modelName: model,
    autoDownloadModelName: model,
    removeWavFileAfterTranscription: true,
    whisperOptions: {
      outputInText: true,
      language: options.language ?? "auto",
    },
  });

  return {
    text,
    source: "model",
    language: options.language ?? "auto",
  };
}
