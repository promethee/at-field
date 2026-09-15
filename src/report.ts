import type { AnalysisResult } from "./types.js";

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function interpretObviousness(score: number): string {
  if (score >= 0.7) {
    return "High — the theme appears to be this audio's stated subject; results largely confirm what a listener would already know.";
  }
  if (score >= 0.3) {
    return "Moderate — the theme is present both directly and through related vocabulary.";
  }
  return "Low — the theme runs through the content mostly via related vocabulary, not as the audio's stated subject. This is the tool's strongest use case.";
}

/**
 * Renders the analysis result as a Markdown report. Section order follows
 * "fastest to slowest to read": score -> disclaimers -> summary table ->
 * timestamped log -> full field -> transcript (linked, not embedded).
 */
export function renderMarkdown(result: AnalysisResult): string {
  const { field, transcript, obviousnessScore, matches, segmentHits } = result;
  const lines: string[] = [];

  lines.push(`# Thematic Analysis: "${field.theme}"`, "");

  lines.push("## Obviousness score", "");
  lines.push(`**${Math.round(obviousnessScore * 100)}%** — ${interpretObviousness(obviousnessScore)}`, "");

  lines.push("## Disclaimers", "");
  lines.push(
    `- Transcript quality: local Whisper output (source: \`${transcript.source}\`, language: \`${transcript.language}\`) — accuracy depends on model size and audio quality.`,
  );
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
  lines.push("See the separate transcript file for the full text (not embedded in this report).", "");

  return lines.join("\n");
}

/**
 * Renders a plain-ASCII terminal summary: obviousness score as a text
 * gauge, top matches as scaled bar rows. No chart dependency, matches the
 * project's minimal-footprint stance.
 */
export function renderTerminalGraphic(result: AnalysisResult): string {
  const { obviousnessScore, matches } = result;
  const lines: string[] = [];

  const gaugeWidth = 20;
  const filled = Math.round(obviousnessScore * gaugeWidth);
  const gauge = "█".repeat(filled) + "░".repeat(gaugeWidth - filled);
  lines.push(`Obviousness [${gauge}] ${Math.round(obviousnessScore * 100)}%`);

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
