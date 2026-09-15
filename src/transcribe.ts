import type { CliOptions, TranscriptResult } from "./types.js";

/**
 * Converts the input audio to whatever local Whisper needs, runs inference,
 * and returns the transcript with its quality disclaimer already implied by
 * `source: "model"` (the only source in v1 — user-provided audio, no
 * caption tiers).
 *
 * NOT IMPLEMENTED — see TODO.md "v1 scope — transcription pipeline".
 */
export async function transcribe(
  options: Pick<CliOptions, "audioPath" | "whisperModel" | "language">,
): Promise<TranscriptResult> {
  throw new Error(
    "transcribe() not implemented: audio conversion + local Whisper integration pending. " +
      `Requested model=${options.whisperModel ?? "(preset default)"}, ` +
      `language=${options.language ?? "auto"}.`,
  );
}

/**
 * Checks whether the given Whisper model is already cached locally.
 * Drives the first-run download-size confirm.
 *
 * NOT IMPLEMENTED.
 */
export async function isModelCached(model: string): Promise<boolean> {
  throw new Error(`isModelCached() not implemented (model=${model}).`);
}
