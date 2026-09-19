import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * Prints a message and waits for a y/n answer. Default is "no" unless
 * defaultYes is true. No external dependency — uses node:readline/promises.
 */
export async function confirm(message: string, defaultYes = false): Promise<boolean> {
  // readline.question() blocks forever on a non-TTY stdin (piped/scripted/
  // CI runs) -- there's no input coming and no EOF either. Found via real
  // testing of the Ollama auto-pull-offer prompt. Same "silent stall, no
  // catchable error" shape this project has already hit three other ways
  // (see INTENT.md) -- fall back to the default instead of hanging.
  if (!stdin.isTTY) {
    console.log(`${message} (non-interactive terminal, using default: ${defaultYes ? "yes" : "no"})`);
    return defaultYes;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await rl.question(`${message} ${suffix} `)).trim().toLowerCase();
  rl.close();
  if (answer === "") return defaultYes;
  return answer === "y" || answer === "yes";
}
