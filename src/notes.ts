export type Verbosity = "quiet" | "normal" | "verbose";

/** Picks the output level from the --quiet / --verbose flags; they exclude each other. */
export function resolveVerbosity(flags: { quiet?: boolean; verbose?: boolean }): Verbosity {
  if (flags.quiet && flags.verbose) {
    throw new Error("--quiet and --verbose cannot be combined");
  }
  if (flags.quiet) return "quiet";
  if (flags.verbose) return "verbose";
  return "normal";
}

/**
 * Short, run-specific limitations for the default output. Facts that hold for
 * every run (the transcript comes from another tool) stay in the report file
 * and in --verbose, so this line only appears when something applies.
 */
export function shortNotes(run: { hasTimestamps: boolean; isThin: boolean; fieldSize: number }): string[] {
  const notes: string[] = [];
  if (!run.hasTimestamps) notes.push("plain-text input has no timestamps");
  if (run.isThin) notes.push(`thin field (${run.fieldSize} words)`);
  return notes;
}

/** One line for the terminal, or null when there is nothing to note. */
export function formatNotes(notes: string[]): string | null {
  return notes.length > 0 ? `Notes: ${notes.join("; ")}` : null;
}
