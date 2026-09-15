import type { LexicalFieldResult } from "./types.js";

/**
 * Expands a user-supplied theme into a lexical field using a local LLM.
 * Field richness (term count) drives the isThin flag.
 *
 * NOT IMPLEMENTED — see TODO.md "v1 scope — theme / lexical analysis".
 */
export async function expandTheme(theme: string): Promise<LexicalFieldResult> {
  throw new Error(`expandTheme() not implemented (theme="${theme}").`);
}

/**
 * Loads a static wordlist file as the lexical field, bypassing dynamic
 * expansion entirely.
 *
 * NOT IMPLEMENTED.
 */
export async function loadLexicFile(path: string): Promise<LexicalFieldResult> {
  throw new Error(`loadLexicFile() not implemented (path="${path}").`);
}
