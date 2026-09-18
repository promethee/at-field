import type { AnalysisResult } from "./types.js";

export const DEFAULT_OBVIOUSNESS_STEPS = 2;

export interface ObviousnessStep {
  step: number;
  totalSteps: number;
  /** 0..1 */
  rangeStart: number;
  /** 0..1 */
  rangeEnd: number;
}

/**
 * Divides the 0..1 obviousness score into `steps` equal-width bands and
 * reports which one the score falls in. No semantic labels ("High" /
 * "Moderate" / "Low") -- those require a judgment call about what counts
 * as "obvious" that varies by content domain and audience, and every
 * attempt at a fixed default (3-band, 4-band, threshold) turned out to be
 * an unconfirmed guess. Even division sidesteps needing one: the user
 * picks their own granularity via --obviousness-steps, the raw percentage
 * is always shown alongside it regardless of steps chosen. See INTENT.md
 * for the fuller reasoning and the deferred v2 idea (user-tunable
 * semantic bands, if real usage feedback ever asks for it).
 */
export function computeObviousnessStep(score: number, steps: number = DEFAULT_OBVIOUSNESS_STEPS): ObviousnessStep {
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error(`obviousness-steps must be a positive integer, got ${steps}`);
  }
  const index = Math.min(steps - 1, Math.floor(score * steps));
  return {
    step: index + 1,
    totalSteps: steps,
    rangeStart: index / steps,
    rangeEnd: (index + 1) / steps,
  };
}

function formatObviousnessStep(step: ObviousnessStep): string {
  const start = Math.round(step.rangeStart * 100);
  const end = Math.round(step.rangeEnd * 100);
  return `step ${step.step}/${step.totalSteps} (band: ${start}%–${end}%)`;
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export interface RenderOptions {
  obviousnessSteps?: number;
  /** filename of the original input transcript, for the report to link back to */
  transcriptFileName?: string;
}

/**
 * Renders the analysis result as a Markdown report. Section order follows
 * "fastest to slowest to read": score -> disclaimers -> summary table ->
 * timestamped log -> full field -> transcript (linked, not embedded).
 */
export function renderMarkdown(result: AnalysisResult, options: RenderOptions = {}): string {
  const { field, transcript, obviousnessScore, matches, segmentHits } = result;
  const steps = options.obviousnessSteps ?? DEFAULT_OBVIOUSNESS_STEPS;
  const lines: string[] = [];

  lines.push(`# Thematic Analysis: "${field.theme}"`, "");

  lines.push("## Obviousness score", "");
  lines.push(
    `**${Math.round(obviousnessScore * 100)}%** — ${formatObviousnessStep(computeObviousnessStep(obviousnessScore, steps))}`,
    "",
  );

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
 * Renders a plain-ASCII terminal summary: obviousness score as a text
 * gauge, top matches as scaled bar rows. No chart dependency, matches the
 * project's minimal-footprint stance.
 */
export function renderTerminalGraphic(result: AnalysisResult, options: RenderOptions = {}): string {
  const { obviousnessScore, matches } = result;
  const steps = options.obviousnessSteps ?? DEFAULT_OBVIOUSNESS_STEPS;
  const lines: string[] = [];

  const gaugeWidth = 20;
  const filled = Math.round(obviousnessScore * gaugeWidth);
  const gauge = "█".repeat(filled) + "░".repeat(gaugeWidth - filled);
  const step = computeObviousnessStep(obviousnessScore, steps);
  lines.push(`Obviousness [${gauge}] ${Math.round(obviousnessScore * 100)}% (${formatObviousnessStep(step)})`);

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
