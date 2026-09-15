import type { PresetName } from "./presets.js";

export interface CliOptions {
  audioPath: string;
  theme?: string;
  lexic?: string;
  preset: PresetName;
  whisperModel?: "tiny" | "base" | "small" | "medium" | "large";
  maxDuration?: number;
  language?: string;
}

export type TranscriptSource = "manual" | "auto" | "model";

export interface TranscriptResult {
  text: string;
  source: TranscriptSource;
  language: string;
}

export interface LexicalFieldResult {
  theme: string;
  terms: string[];
  /** true if the expanded field is unusually small (see thin-field disclosure) */
  isThin: boolean;
}

export interface AnalysisResult {
  transcript: TranscriptResult;
  field: LexicalFieldResult;
  /** 0..1 — how much the theme overlaps with the audio's stated/obvious subject */
  obviousnessScore: number;
  matches: Array<{ term: string; count: number }>;
}
