import crypto from "node:crypto";
import path from "node:path";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

export interface OutputPaths {
  reportPath: string;
  transcriptPath: string;
  reportFileName: string;
  transcriptFileName: string;
}

/**
 * Builds report/transcript file paths in the same directory as the input
 * audio: <audio-basename>.<theme-slug>.<short-uuid>.md / .transcript.txt.
 * The UUID suffix guarantees no collision between runs (including same-day
 * reruns on the same audio+theme) without needing a date prefix -- file
 * metadata (mtime) already carries recency information.
 */
export function buildOutputPaths(audioPath: string, theme: string): OutputPaths {
  const dir = path.dirname(audioPath);
  const audioBase = slugify(path.basename(audioPath, path.extname(audioPath)));
  const themeSlug = slugify(theme);
  const suffix = crypto.randomUUID().slice(0, 8);

  const stem = `${audioBase}.${themeSlug}.${suffix}`;
  const reportFileName = `${stem}.md`;
  const transcriptFileName = `${stem}.transcript.txt`;

  return {
    reportPath: path.join(dir, reportFileName),
    transcriptPath: path.join(dir, transcriptFileName),
    reportFileName,
    transcriptFileName,
  };
}
