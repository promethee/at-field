import type { AnalysisResult } from "./types.js";
import { DEFAULT_STEM_LENGTH } from "./stems.js";

// Arbitrary, disclosed defaults (percent). Meant to be overridden by users
// who know their material -- see INTENT.md. Low: below it a theme is barely
// touched. High: above it the field dominates the content.
export const DEFAULT_SATURATION_LOW = 10;
export const DEFAULT_SATURATION_HIGH = 70;

export type SaturationPosition = "below" | "between" | "above";

/**
 * Where a 0..1 saturation score sits relative to the two boundaries
 * (percent). Purely positional -- no "High"/"Low" verdict; what a position
 * means is the user's call (see INTENT.md).
 */
export function saturationPosition(score: number, low: number, high: number): SaturationPosition {
  const pct = score * 100;
  if (pct < low) return "below";
  if (pct > high) return "above";
  return "between";
}

function describePosition(position: SaturationPosition, low: number, high: number): string {
  if (position === "below") return `below the low boundary (${low}%)`;
  if (position === "above") return `above the high boundary (${high}%)`;
  return `between the boundaries (${low}%–${high}%)`;
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export interface RenderOptions {
  /** percent, 0..100 */
  saturationLow?: number;
  /** percent, 0..100 */
  saturationHigh?: number;
  /** filename of the original input transcript, for the report to link back to */
  transcriptFileName?: string;
}

/**
 * Renders the analysis result as a Markdown report. Section order follows
 * "fastest to slowest to read": score -> disclaimers -> summary table ->
 * timestamped log -> full field -> transcript (linked, not embedded).
 */
export function renderMarkdown(result: AnalysisResult, options: RenderOptions = {}): string {
  const { field, transcript, saturation, termsFound, fieldSize, matchesPer1000Words, matches, segmentHits } = result;
  const low = options.saturationLow ?? DEFAULT_SATURATION_LOW;
  const high = options.saturationHigh ?? DEFAULT_SATURATION_HIGH;
  const lines: string[] = [];

  lines.push(`# Thematic Analysis: "${field.theme}"`, "");

  lines.push("## Lexical saturation", "");
  lines.push(
    `**${Math.round(saturation * 100)}%** — ${termsFound} of ${fieldSize} field terms found, ${matchesPer1000Words.toFixed(1)} matches per 1,000 words.`,
    "",
  );
  lines.push(`Position: ${describePosition(saturationPosition(saturation, low, high), low, high)}.`, "");

  lines.push("## Disclaimers", "");
  lines.push(
    `- Transcript source: user-provided (language: \`${transcript.language}\`) — accuracy depends on whatever tool produced this transcript, not on at-field.`,
  );
  if (transcript.segments.length === 0) {
    lines.push(
      `- No timestamps: plain-text input has no segment timing, so timestamped occurrences below will be empty. Use \`.srt\`/\`.vtt\` input to keep them.`,
    );
  }
  if (field.isThin) {
    lines.push(
      `- Thin field: only ${field.terms.length} term(s) found for "${field.theme}" (threshold: 8). Results may resemble keyword-spotting rather than a broad thematic analysis.`,
    );
  }
  if (field.stemLength === 0) {
    lines.push(
      `- Stem filtering off (--stem-length 0): words sharing a stem with the theme, such as an inflected form of a theme word, stay in the field, so hits on them partly restate the theme, and forms of one word count separately.`,
    );
  } else if (field.stemLength !== undefined && field.stemLength !== DEFAULT_STEM_LENGTH) {
    lines.push(
      `- Stem length ${field.stemLength} (default ${DEFAULT_STEM_LENGTH}): words sharing their first ${field.stemLength} letters count as forms of one word, and words sharing them with the theme are dropped.`,
    );
  }
  lines.push("");

  lines.push("## Summary", "");
  if (matches.length === 0) {
    lines.push("No field terms were found in the transcript.", "");
  } else {
    lines.push("| Term | Count |", "|---|---|");
    for (const m of matches) {
      lines.push(`| ${m.term} | ${m.count} |`);
    }
    lines.push("");
  }

  lines.push("## Timestamped occurrences", "");
  if (segmentHits.length === 0) {
    lines.push("No timestamped occurrences found.", "");
  } else {
    for (const hit of segmentHits) {
      lines.push(
        `- [${formatTimestamp(hit.start)}–${formatTimestamp(hit.end)}]: ${hit.terms.join(", ")}`,
      );
    }
    lines.push("");
  }

  lines.push("## Full lexical field", "");
  lines.push(
    field.terms.length > 0
      ? field.terms.map((t) => `\`${t}\``).join(", ")
      : "(no terms — static wordlist was empty or theme expansion returned none)",
  );
  lines.push("");

  lines.push("## Transcript", "");
  lines.push(
    options.transcriptFileName
      ? `See \`${options.transcriptFileName}\` (the original input) for the full transcript text.`
      : "See the original input transcript for the full text (not embedded in this report).",
    "",
  );

  return lines.join("\n");
}

/**
 * Renders a plain-ASCII terminal summary: saturation score as a text
 * gauge, top matches as scaled bar rows. No chart dependency, matches the
 * project's minimal-footprint stance.
 */
export function renderTerminalGraphic(result: AnalysisResult, options: RenderOptions = {}): string {
  const { saturation, termsFound, fieldSize, matches } = result;
  const low = options.saturationLow ?? DEFAULT_SATURATION_LOW;
  const high = options.saturationHigh ?? DEFAULT_SATURATION_HIGH;
  const lines: string[] = [];

  const gaugeWidth = 20;
  const filled = Math.round(saturation * gaugeWidth);
  const gauge = "█".repeat(filled) + "░".repeat(gaugeWidth - filled);
  lines.push(
    `Saturation [${gauge}] ${Math.round(saturation * 100)}% (${termsFound}/${fieldSize} terms, ${describePosition(saturationPosition(saturation, low, high), low, high)})`,
  );

  if (matches.length > 0) {
    lines.push("");
    const top = matches.slice(0, 10);
    const maxCount = top[0].count;
    const maxTermLength = Math.max(...top.map((m) => m.term.length));
    const barWidth = 30;
    for (const m of top) {
      const barLength = Math.max(1, Math.round((m.count / maxCount) * barWidth));
      const bar = "█".repeat(barLength);
      lines.push(`${m.term.padEnd(maxTermLength)} ${bar} ${m.count}`);
    }
    if (matches.length > top.length) {
      lines.push(`... and ${matches.length - top.length} more`);
    }
  }

  return lines.join("\n");
}
