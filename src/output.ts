import crypto from "node:crypto";
import path from "node:path";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

export interface OutputPaths {
  reportPath: string;
  reportFileName: string;
}

/**
 * Builds the report's file path in the same directory as the input
 * transcript: <transcript-basename>.<theme-slug>.<short-uuid>.md. The
 * UUID suffix guarantees no collision between runs (including same-day
 * reruns on the same transcript+theme) without needing a date prefix --
 * file metadata (mtime) already carries recency information.
 *
 * No separate transcript file is written anymore -- the input already is
 * the transcript (see INTENT.md's text-to-text pivot), so there's nothing
 * to duplicate or later look up for reuse.
 */
export function buildOutputPaths(transcriptPath: string, theme: string): OutputPaths {
  const dir = path.dirname(transcriptPath);
  const base = slugify(path.basename(transcriptPath, path.extname(transcriptPath)));
  const themeSlug = slugify(theme);
  const suffix = crypto.randomUUID().slice(0, 8);

  const reportFileName = `${base}.${themeSlug}.${suffix}.md`;

  return {
    reportPath: path.join(dir, reportFileName),
    reportFileName,
  };
}
