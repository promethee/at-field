import type { AnalysisResult, LexicalFieldResult, SegmentHit, TranscriptResult } from "./types.js";

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(text: string, term: string): number {
  // Word-boundary match, case-insensitive. Works for multi-word terms
  // (e.g. "dog food") since \b anchors on the outer edges only.
  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
  return (text.match(pattern) ?? []).length;
}

function hasOccurrence(text: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text);
}

/**
 * One entry per transcript segment that contains at least one field-term
 * hit (theme word or any related term). Powers the timestamped log in
 * report.ts -- bracketed by Whisper's own segment boundaries rather than
 * an invented merge-window.
 */
function computeSegmentHits(transcript: TranscriptResult, field: LexicalFieldResult): SegmentHit[] {
  const allTerms = [field.theme, ...field.terms];
  const hits: SegmentHit[] = [];

  for (const segment of transcript.segments) {
    const hitTerms = allTerms.filter((term) => hasOccurrence(segment.text, term));
    if (hitTerms.length > 0) {
      hits.push({ start: segment.start, end: segment.end, terms: [...new Set(hitTerms)] });
    }
  }

  return hits;
}

/**
 * Cross-references the lexical field against the transcript and computes
 * lexical saturation: distinct field terms found / field size. It measures
 * how much of the theme's *vocabulary* shows up in the text, independent of
 * whether the theme word itself is ever spoken -- the earlier
 * "obviousness" ratio (literal theme hits / all hits) read 0% for texts
 * that clearly touched the theme (see INTENT.md). Density (matches per
 * 1,000 words) is reported alongside because coverage alone can't tell a
 * passing mention from a pervasive one in a long transcript.
 *
 * Empty field -> saturation 0 (nothing to measure against).
 */
export async function analyze(
  transcript: TranscriptResult,
  field: LexicalFieldResult,
): Promise<AnalysisResult> {
  const matches = field.terms
    .map((term) => ({ term, count: countOccurrences(transcript.text, term) }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count);

  const fieldSize = field.terms.length;
  const totalMatches = matches.reduce((sum, m) => sum + m.count, 0);
  const wordCount = transcript.text.split(/\s+/).filter(Boolean).length;

  return {
    transcript,
    field,
    saturation: fieldSize === 0 ? 0 : matches.length / fieldSize,
    termsFound: matches.length,
    fieldSize,
    matchesPer1000Words: wordCount === 0 ? 0 : (totalMatches / wordCount) * 1000,
    matches,
    segmentHits: computeSegmentHits(transcript, field),
  };
}
