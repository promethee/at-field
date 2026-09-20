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
  /** stem length the expansion filters used; undefined for a --lexic wordlist */
  stemLength?: number;
}

export interface SegmentHit {
  start: number;
  end: number;
  terms: string[];
}

export interface AnalysisResult {
  transcript: TranscriptResult;
  field: LexicalFieldResult;
  /** 0..1 — distinct field terms found in the transcript / field size */
  saturation: number;
  /** distinct field terms found (numerator of saturation) */
  termsFound: number;
  /** number of terms in the lexical field (denominator of saturation) */
  fieldSize: number;
  /** total field-term matches per 1,000 transcript words */
  matchesPer1000Words: number;
  matches: Array<{ term: string; count: number }>;
  /** one entry per segment that contains at least one field-term hit */
  segmentHits: SegmentHit[];
}
