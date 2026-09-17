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
 * Parses a CLI time value into seconds. Accepts plain seconds ("90",
 * "90.5"), "MM:SS", or "HH:MM:SS" -- the same shapes ffmpeg itself accepts
 * for -ss/-to, minus ffmpeg's own decimal-hour form (not offered here,
 * matches this project's minimal-flag-surface stance).
 */
export function parseTimeToSeconds(value: string): number {
  const parts = value.split(":").map((p) => p.trim());
  if (parts.length > 3 || parts.some((p) => p === "" || Number.isNaN(Number(p)))) {
    throw new Error(`invalid time value "${value}" -- expected SS, MM:SS, or HH:MM:SS`);
  }
  const seconds = parts.map(Number).reduce((acc, n) => acc * 60 + n, 0);
  if (seconds < 0) {
    throw new Error(`invalid time value "${value}" -- must not be negative`);
  }
  return seconds;
}

export interface SegmentRangeInfo {
  startSeconds: number;
  /** null when no explicit --end was given (range runs to the original audio's end) */
  endSeconds: number | null;
}

export interface RangeTrimResult {
  /** path to transcribe -- either the original file or a range-extracted temp copy */
  path: string;
  trimmed: boolean;
  originalSeconds: number;
  /** null when neither --start nor --end was given */
  range: SegmentRangeInfo | null;
  /** call after transcription to remove the temp range file, if one was made */
  cleanup: () => void;
}

/**
 * Extracts [startSeconds, endSeconds) from the input audio before
 * transcription, so a --start/--end run doesn't pay transcription cost for
 * audio outside the requested range. Independent of trimToMaxDuration --
 * the two compose (this runs first; the max-duration cap then applies to
 * the extracted range's own duration).
 *
 * null/null (neither flag passed) disables this entirely -- no probing, no
 * extraction, original file used as-is.
 */
export async function trimToRange(
  filePath: string,
  startSeconds: number | null,
  endSeconds: number | null,
): Promise<RangeTrimResult> {
  if (startSeconds === null && endSeconds === null) {
    const originalSeconds = await getAudioDurationSeconds(filePath).catch(() => NaN);
    return { path: filePath, trimmed: false, originalSeconds, range: null, cleanup: () => {} };
  }

  const originalSeconds = await getAudioDurationSeconds(filePath);
  const start = startSeconds ?? 0;
  if (start >= originalSeconds) {
    throw new Error(`--start (${start}s) is at or past the audio's duration (${originalSeconds.toFixed(1)}s)`);
  }
  if (endSeconds !== null && endSeconds <= start) {
    throw new Error(`--end (${endSeconds}s) must be after --start (${start}s)`);
  }

  const effectiveEnd = endSeconds !== null ? Math.min(endSeconds, originalSeconds) : originalSeconds;
  const duration = effectiveEnd - start;

  const tmpPath = path.join(os.tmpdir(), `at-field-range-${Date.now()}${path.extname(filePath)}`);
  await execFileAsync("ffmpeg", ["-y", "-ss", String(start), "-i", filePath, "-t", String(duration), "-c", "copy", tmpPath]);

  return {
    path: tmpPath,
    trimmed: true,
    originalSeconds,
    range: { startSeconds: start, endSeconds: endSeconds !== null ? effectiveEnd : null },
    cleanup: () => {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    },
  };
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
