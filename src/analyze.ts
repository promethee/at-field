import type { AnalysisResult, LexicalFieldResult, TranscriptResult } from "./types.js";

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(text: string, term: string): number {
  // Word-boundary match, case-insensitive. Works for multi-word terms
  // (e.g. "dog food") since \b anchors on the outer edges only.
  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
  return (text.match(pattern) ?? []).length;
}

/**
 * Cross-references the lexical field against the transcript, counts term
 * matches, and computes the obviousness score.
 *
 * obviousnessScore = literal theme-term matches / total field matches
 * (literal theme matches + every other field term's matches combined).
 *
 * Rationale: if most of the field's presence in the transcript is just the
 * theme word itself repeated, the audio is stating its subject outright
 * (high obviousness -- low analytical value, see INTENT.md). If matches
 * spread across the broader field with few literal mentions of the theme
 * word, the theme runs through the content without being its stated
 * subject (low obviousness -- the tool's actual value case).
 *
 * 0 total matches -> score is 0 (no evidence of the theme either way,
 * distinct from "obviously not obvious").
 */
export async function analyze(
  transcript: TranscriptResult,
  field: LexicalFieldResult,
): Promise<AnalysisResult> {
  const literalThemeMatches = countOccurrences(transcript.text, field.theme);

  const matches = field.terms
    .map((term) => ({ term, count: countOccurrences(transcript.text, term) }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count);

  const otherFieldMatches = matches
    .filter((m) => m.term.toLowerCase() !== field.theme.toLowerCase())
    .reduce((sum, m) => sum + m.count, 0);

  const totalMatches = literalThemeMatches + otherFieldMatches;
  const obviousnessScore = totalMatches === 0 ? 0 : literalThemeMatches / totalMatches;

  return {
    transcript,
    field,
    obviousnessScore,
    matches,
  };
}
