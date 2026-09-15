import type { AnalysisResult, LexicalFieldResult, TranscriptResult } from "./types.js";

/**
 * Cross-references the lexical field against the transcript, counts term
 * matches, and computes the obviousness score (literal theme-term density
 * vs. field richness).
 *
 * Formula not yet decided — see TODO.md "Open decisions".
 * NOT IMPLEMENTED.
 */
export async function analyze(
  transcript: TranscriptResult,
  field: LexicalFieldResult,
): Promise<AnalysisResult> {
  throw new Error(
    `analyze() not implemented (theme="${field.theme}", transcript length=${transcript.text.length}).`,
  );
}
