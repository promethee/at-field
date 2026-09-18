import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { initWhisper, type LibVariant, type TranscribeResult } from "@fugood/whisper.node";

import type { CliOptions, TranscriptResult, TranscriptSegment } from "./types.js";

// Vulkan works across AMD/Intel/Nvidia GPUs on Windows/Linux; macOS's
// "default" variant already supports Metal when useGpu is true, so no
// separate variant is needed there. CUDA isn't tried separately -- Vulkan
// already covers Nvidia GPUs too, and picking one non-default variant
// keeps this simple.
const GPU_VARIANT: LibVariant | undefined = process.platform === "darwin" ? undefined : "vulkan";

export type WhisperModelName = "tiny" | "base" | "small" | "medium" | "large";

// Filenames as published under huggingface.co/ggerganov/whisper.cpp -- the
// same official GGML model repo nodejs-whisper's own download script used.
// "large" maps to the current v3 release; the other four map 1:1.
const MODEL_FILENAMES: Record<WhisperModelName, string> = {
  tiny: "ggml-tiny.bin",
  base: "ggml-base.bin",
  small: "ggml-small.bin",
  medium: "ggml-medium.bin",
  large: "ggml-large-v3.bin",
};

// User-level cache, independent of how the CLI itself was installed (local
// clone, global npm install, or a one-off `npx` tarball run) -- unlike the
// previous nodejs-whisper-based design, model storage is no longer tied to
// a dependency's own node_modules folder.
const MODEL_DIR = path.join(os.homedir(), ".cache", "at-field", "whisper-models");

function modelPathFor(model: string): string {
  const filename = MODEL_FILENAMES[model as WhisperModelName];
  if (!filename) {
    throw new Error(`Unknown whisper model "${model}". Valid: ${Object.keys(MODEL_FILENAMES).join(", ")}`);
  }
  return path.join(MODEL_DIR, filename);
}

/**
 * Checks whether the given Whisper model's weights are already downloaded
 * locally, so the CLI can decide whether to show the first-run
 * download-size confirm *before* invoking transcription.
 */
export async function isModelCached(model: string): Promise<boolean> {
  return fs.existsSync(modelPathFor(model));
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(destPath);
          downloadFile(res.headers.location, destPath).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          reject(new Error(`Failed to download model (HTTP ${res.statusCode}) from ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
  });
}

/**
 * Downloads the given model's weights if not already cached. Idempotent.
 * Called explicitly from cli.ts (after its own confirm gate) rather than
 * internally from transcribe() -- so a multi-GB download gets its own
 * visible stage message instead of silently happening while the
 * "Transcribing..." message is already on screen.
 */
export async function ensureModelDownloaded(model: string): Promise<void> {
  const destPath = modelPathFor(model);
  if (fs.existsSync(destPath)) return;
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILENAMES[model as WhisperModelName]}`;
  await downloadFile(url, destPath);
}

/**
 * Runs one transcription attempt end-to-end (init context, transcribe,
 * release) with the given GPU settings. Separated from transcribe() so a
 * GPU attempt and its CPU fallback are two clean, independent calls rather
 * than intertwined try/catch branches.
 */
async function runTranscription(
  modelPath: string,
  audioPath: string,
  language: string | undefined,
  useGpu: boolean,
  variant?: LibVariant,
): Promise<TranscribeResult> {
  const context = await initWhisper({ filePath: modelPath, useGpu }, variant);
  try {
    // whisper.cpp's bundled `miniaudio` decoder reads mp3/wav/flac/etc.
    // directly -- no ffmpeg pre-conversion step needed here (ffmpeg is
    // still used elsewhere, for --start/--end/--max-duration trimming).
    const { promise } = context.transcribeFile(audioPath, {
      language,
      maxThreads: os.cpus().length,
    });
    return await promise;
  } finally {
    await context.release();
  }
}

/**
 * Transcribes the input audio with a local Whisper model via
 * @fugood/whisper.node (prebuilt native whisper.cpp bindings -- no local
 * compile step, unlike the nodejs-whisper backend this replaced). Assumes
 * the model is already downloaded -- callers must await
 * ensureModelDownloaded() first (cli.ts does, with its own confirm gate
 * and stage message; this function stays a pure transcription step).
 *
 * Tries GPU acceleration first (via the platform's Vulkan build, or
 * macOS's Metal-capable default build), falling back to CPU-only if the
 * GPU attempt throws -- CPU-only is the long-proven-reliable path, GPU is
 * new and unverified across the range of real hardware this will run on.
 */
export async function transcribe(
  options: Pick<CliOptions, "audioPath" | "whisperModel" | "language">,
): Promise<TranscriptResult> {
  const model = options.whisperModel ?? "base";

  if (!fs.existsSync(options.audioPath)) {
    throw new Error(`Audio file not found: ${options.audioPath}`);
  }

  const requestedLanguage = options.language ?? "auto";
  // Omitting `language` (rather than passing "auto") is what actually
  // triggers whisper.cpp's own real language auto-detection -- see
  // WhisperContext.cpp: an empty/unset language leaves whisper.cpp's own
  // default in place, which is auto-detect.
  const languageParam = requestedLanguage === "auto" ? undefined : requestedLanguage;
  const modelPath = modelPathFor(model);

  let result: TranscribeResult;
  let gpuUsed: boolean;
  try {
    result = await runTranscription(modelPath, options.audioPath, languageParam, true, GPU_VARIANT);
    gpuUsed = true;
  } catch {
    result = await runTranscription(modelPath, options.audioPath, languageParam, false);
    gpuUsed = false;
  }

  const segments: TranscriptSegment[] = result.segments.map((s) => ({
    start: s.t0 / 1000,
    end: s.t1 / 1000,
    text: s.text.trim(),
  }));

  return {
    text: result.result.trim(),
    segments,
    source: "model",
    // Real detected/used language, straight from whisper.cpp's own
    // output -- no more scraping stderr log lines for it.
    language: result.language ?? requestedLanguage,
    // Duration-cap / segment-range trimming both happen before
    // transcribe() is called (see src/audio.ts + cli.ts) -- transcribe()
    // itself is unaware of either. The caller attaches the real values
    // afterward.
    durationCap: null,
    segmentRange: null,
    gpuUsed,
  };
}
