import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * Prints a message and waits for a y/n answer. Default is "no" unless
 * defaultYes is true. No external dependency — uses node:readline/promises.
 */
export async function confirm(message: string, defaultYes = false): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await rl.question(`${message} ${suffix} `)).trim().toLowerCase();
  rl.close();
  if (answer === "") return defaultYes;
  return answer === "y" || answer === "yes";
}

// Approximate ggml model file sizes (ggerganov/whisper.cpp on Hugging
// Face), for the download-size confirm message. Not exact — informational
// only. "large" is the current large-v3 release.
export const APPROX_MODEL_SIZE_MB: Record<string, number> = {
  tiny: 74,
  base: 141,
  small: 465,
  medium: 1462,
  large: 2952,
};
