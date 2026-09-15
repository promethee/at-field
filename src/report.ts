import type { AnalysisResult } from "./types.js";

/**
 * Renders the analysis result as a Markdown report string.
 * Markdown is the only output format for v1 (see INTENT.md non-goals).
 *
 * NOT IMPLEMENTED — see TODO.md "v1 scope — output".
 */
export function renderMarkdown(result: AnalysisResult): string {
  throw new Error("renderMarkdown() not implemented.");
}

/**
 * Renders a terminal-friendly graphic summary of the analysis result.
 *
 * NOT IMPLEMENTED.
 */
export function renderTerminalGraphic(result: AnalysisResult): string {
  throw new Error("renderTerminalGraphic() not implemented.");
}
