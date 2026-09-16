import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const execFileAsync = promisify(execFile);

export interface TrimResult {
  /** path to transcribe -- either the original file or a trimmed temp copy */
  path: string;
  trimmed: boolean;
  originalSeconds: number;
  /** null when not trimmed */
  cappedSeconds: number | null;
  /** call after transcription to remove the temp trimmed file, if one was made */
  cleanup: () => void;
}

/**
 * Reads the audio file's duration via ffprobe. Throws if the file can't be
 * probed (missing, corrupt, or an unsupported format).
 */
export async function getAudioDurationSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds)) {
    throw new Error(`Could not determine duration of "${filePath}" (ffprobe output: "${stdout.trim()}")`);
  }
  return seconds;
}

/**
 * Trims the input audio to at most maxDurationMinutes before transcription,
 * so capped-duration runs don't pay transcription cost for the discarded
 * portion. maxDurationMinutes <= 0 disables the cap entirely (no probing,
 * no trimming, original file used as-is).
 *
 * This is a lossy, disclosed operation: the caller must surface the
 * trimming to the user (both in cli.ts's printed output and in the
 * Markdown report) -- content beyond the cap is never analyzed.
 */
export async function trimToMaxDuration(filePath: string, maxDurationMinutes: number): Promise<TrimResult> {
  if (maxDurationMinutes <= 0) {
    const originalSeconds = await getAudioDurationSeconds(filePath).catch(() => NaN);
    return {
      path: filePath,
      trimmed: false,
      originalSeconds,
      cappedSeconds: null,
      cleanup: () => {},
    };
  }

  const maxSeconds = maxDurationMinutes * 60;
  const originalSeconds = await getAudioDurationSeconds(filePath);

  if (originalSeconds <= maxSeconds) {
    return {
      path: filePath,
      trimmed: false,
      originalSeconds,
      cappedSeconds: null,
      cleanup: () => {},
    };
  }

  const tmpPath = path.join(os.tmpdir(), `at-field-trimmed-${Date.now()}${path.extname(filePath)}`);
  await execFileAsync("ffmpeg", ["-y", "-i", filePath, "-t", String(maxSeconds), "-c", "copy", tmpPath]);

  return {
    path: tmpPath,
    trimmed: true,
    originalSeconds,
    cappedSeconds: maxSeconds,
    cleanup: () => {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    },
  };
}
