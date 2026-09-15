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

// Approximate ggml model file sizes, for the download-size confirm message.
// Not exact — informational only.
export const APPROX_MODEL_SIZE_MB: Record<string, number> = {
  tiny: 75,
  base: 142,
  small: 466,
  medium: 1500,
  large: 2900,
};
