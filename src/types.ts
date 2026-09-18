export interface CliOptions {
  theme?: string;
  lexic?: string;
  language?: string;
}

export interface TranscriptSegment {
  /** seconds */
  start: number;
  /** seconds */
  end: number;
  text: string;
}

export interface TranscriptResult {
  text: string;
  /** ISO 639-1 code detected from the transcript text, or "unknown" */
  language: string;
  /** empty for plain-text input -- only .srt/.vtt carry real timestamps */
  segments: TranscriptSegment[];
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
  /** 0..1 — how much the theme overlaps with the transcript's stated/obvious subject */
  obviousnessScore: number;
  matches: Array<{ term: string; count: number }>;
  /** one entry per segment that contains at least one field-term hit */
  segmentHits: SegmentHit[];
}
