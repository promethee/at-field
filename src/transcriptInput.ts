import fs from "node:fs";
import path from "node:path";
import { detectLanguageCode } from "./language.js";
import type { TranscriptResult, TranscriptSegment } from "./types.js";

// Matches a subtitle cue's timestamp line in either SRT (comma decimals,
// always HH:MM:SS) or WebVTT (dot decimals, hours optional) -- the two
// formats are close enough to share one pattern.
const TIMESTAMP_LINE = /^(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})/;

function timeToSeconds(h: string | undefined, m: string, s: string, ms: string): number {
  return (h ? Number(h) * 3600 : 0) + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

/**
 * Parses SRT or WebVTT subtitle text into segments. Both formats share the
 * same shape closely enough to parse in one pass: blocks separated by a
 * blank line, each containing a "start --> end" timestamp line and one or
 * more text lines (SRT additionally has a leading cue-number line, WebVTT
 * has a "WEBVTT" header and optional cue identifiers -- neither matches
 * the timestamp pattern, so both are skipped automatically rather than
 * needing format-specific handling).
 */
export function parseSubtitles(content: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = content.replace(/\r\n/g, "\n").split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const timestampIndex = lines.findIndex((l) => TIMESTAMP_LINE.test(l));
    if (timestampIndex === -1) continue;

    const match = TIMESTAMP_LINE.exec(lines[timestampIndex])!;
    const [, h1, m1, s1, ms1, h2, m2, s2, ms2] = match;
    const text = lines.slice(timestampIndex + 1).join(" ").trim();
    if (!text) continue;

    segments.push({
      start: timeToSeconds(h1, m1, s1, ms1),
      end: timeToSeconds(h2, m2, s2, ms2),
      text,
    });
  }

  return segments;
}

/**
 * Loads a premade transcript file -- the input path for at-field's
 * text-to-text pivot (no audio, no Whisper; the user supplies a
 * transcript from whatever tool already works for them, see INTENT.md).
 *
 * `.srt`/`.vtt` carry real timestamps, so segmentHits/timestamped
 * occurrences keep working exactly as before. Plain `.txt` (or any other
 * extension) is treated as raw text with no timestamps -- same
 * "timestamped occurrences will be empty" limitation the implicit
 * transcript-reuse feature already discloses for its own case, not a new
 * one introduced here.
 *
 * Language is detected directly from the transcript text itself, not
 * guessed from the short --theme string the way the old
 * Whisper-auto-detect comparison had to. A full transcript gives
 * franc-min far more signal than a short theme phrase ever could --
 * confidence here should be meaningfully more reliable.
 */
export function loadTranscriptFile(filePath: string): TranscriptResult {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Transcript file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const ext = path.extname(filePath).toLowerCase();

  const segments = ext === ".srt" || ext === ".vtt" ? parseSubtitles(raw) : [];
  const text = segments.length > 0 ? segments.map((s) => s.text).join(" ") : raw.trim();

  const detected = detectLanguageCode(text);

  return {
    text,
    source: "manual",
    language: detected.code ?? "unknown",
    segments,
    durationCap: null,
    segmentRange: null,
    gpuUsed: null,
  };
}
