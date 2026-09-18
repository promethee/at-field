import type { PresetName } from "./presets.js";

export interface CliOptions {
  audioPath: string;
  theme?: string;
  lexic?: string;
  preset: PresetName;
  whisperModel?: "tiny" | "base" | "small" | "medium" | "large";
  maxDuration?: number;
  language?: string;
  /** seconds; null/undefined when not given */
  startSeconds?: number | null;
  /** seconds; null/undefined when not given */
  endSeconds?: number | null;
}

export type TranscriptSource = "manual" | "auto" | "model";

export interface TranscriptSegment {
  /** seconds */
  start: number;
  /** seconds */
  end: number;
  text: string;
}

export interface DurationCapInfo {
  originalSeconds: number;
  cappedSeconds: number;
}

export interface SegmentRangeInfo {
  startSeconds: number;
  /** null when no explicit --end was given (range runs to the original audio's end) */
  endSeconds: number | null;
}

export interface TranscriptResult {
  text: string;
  source: TranscriptSource;
  language: string;
  segments: TranscriptSegment[];
  /** null when no duration cap was applied (audio within cap, or cap disabled) */
  durationCap: DurationCapInfo | null;
  /** null when no --start/--end range was requested */
  segmentRange: SegmentRangeInfo | null;
  /**
   * true if GPU acceleration was used, false if it was attempted and fell
   * back to CPU, null for a reused transcript (no hardware info saved).
   */
  gpuUsed: boolean | null;
}

export interface LexicalFieldResult {
  theme: string;
  terms: string[];
  /** true if the expanded field is unusually small (see thin-field disclosure) */
  isThin: boolean;
}

export interface SegmentHit {
  start: number;
  end: number;
  terms: string[];
}

export interface AnalysisResult {
  transcript: TranscriptResult;
  field: LexicalFieldResult;
  /** 0..1 — how much the theme overlaps with the audio's stated/obvious subject */
  obviousnessScore: number;
  matches: Array<{ term: string; count: number }>;
  /** one entry per segment that contains at least one field-term hit */
  segmentHits: SegmentHit[];
}
