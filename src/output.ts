import crypto from "node:crypto";
import fs from "node:fs";
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

export interface ExistingTranscript {
  path: string;
  fileName: string;
}

/**
 * Looks for a transcript file already written for this exact audio+theme
 * combination (same naming convention buildOutputPaths produces), so a
 * retry -- e.g. after a language-mismatch stop -- can skip re-transcribing
 * entirely. No new flag: this is a side effect of the existing output
 * convention, not a separate feature surface (see INTENT.md). If more than
 * one matches (multiple prior runs), the most recently modified one wins.
 */
export function findExistingTranscript(audioPath: string, theme: string): ExistingTranscript | null {
  const dir = path.dirname(audioPath);
  const audioBase = slugify(path.basename(audioPath, path.extname(audioPath)));
  const themeSlug = slugify(theme);
  const pattern = new RegExp(`^${audioBase}\\.${themeSlug}\\.[0-9a-f]{8}\\.transcript\\.txt$`);

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }

  const matches = entries
    .filter((name) => pattern.test(name))
    .map((name) => {
      const fullPath = path.join(dir, name);
      return { fileName: name, path: fullPath, mtime: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  if (matches.length === 0) return null;
  return { path: matches[0].path, fileName: matches[0].fileName };
}
