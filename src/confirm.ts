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
