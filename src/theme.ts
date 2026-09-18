import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getLlama, LlamaChatSession, resolveModelFile } from "node-llama-cpp";
import type { LexicalFieldResult } from "./types.js";

// Small instruct model, good enough for a bounded JSON-list generation task.
// "hf:" URI is resolved/downloaded by node-llama-cpp on first use.
const DEFAULT_MODEL_URI = "hf:Qwen/Qwen2.5-0.5B-Instruct-GGUF/qwen2.5-0.5b-instruct-q4_k_m.gguf";

const MODELS_DIR = path.join(os.homedir(), ".cache", "at-field", "models");

// Below this term count, the expanded field is flagged as thin (see
// INTENT.md — likely indicates a narrow subject rather than a broad theme,
// or a prompt/model limitation). Heuristic, not exact.
const THIN_FIELD_THRESHOLD = 8;

const FIELD_SCHEMA = {
  type: "object",
  properties: {
    terms: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 40,
    },
  },
  required: ["terms"],
} as const;

/**
 * Checks whether the default local theme-expansion model is already
 * downloaded, without loading or running it.
 */
export async function isThemeModelCached(modelUri: string = DEFAULT_MODEL_URI): Promise<boolean> {
  try {
    // download: false -- resolves an existing local file only, never fetches.
    await resolveModelFile(modelUri, { directory: MODELS_DIR, download: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Expands a user-supplied theme into a lexical field using a local LLM
 * (node-llama-cpp, in-process, no external daemon). Output is constrained
 * to a JSON schema so parsing never fails on free-text drift.
 *
 * CPU-only, deliberately. getLlama() defaults to `gpu: "auto"`, trying a
 * GPU backend itself before falling back to CPU -- explicitly disabled
 * here (`gpu: false`) after the equivalent auto-GPU-then-fallback attempt
 * in transcribe() locked up a real test machine hard enough to need a
 * full reset. Not reintroduced until that failure mode is understood, out
 * of caution even though this stalling incident wasn't confirmed to be
 * this code path specifically. See INTENT.md.
 */
export async function expandTheme(
  theme: string,
  modelUri: string = DEFAULT_MODEL_URI,
): Promise<LexicalFieldResult> {
  const llama = await getLlama({ gpu: false });
  const gpuUsed = llama.gpu;
  const modelPath = await resolveModelFile(modelUri, { directory: MODELS_DIR });
  const model = await llama.loadModel({ modelPath });
  const context = await model.createContext();
  const session = new LlamaChatSession({ contextSequence: context.getSequence() });

  const prompt =
    `List the lexical field of the theme/topic "${theme}": words and short phrases ` +
    `commonly associated with it (not just synonyms of the theme word itself). ` +
    `Return 15-30 distinct terms if the theme is broad enough to support that many; ` +
    `fewer is fine for a genuinely narrow theme.`;

  const response = await session.prompt(prompt, {
    grammar: await llama.createGrammarForJsonSchema(FIELD_SCHEMA),
  });

  const parsed = JSON.parse(response) as { terms: string[] };
  const terms = [...new Set(parsed.terms.map((t) => t.trim()).filter(Boolean))];

  await context.dispose();
  await model.dispose();

  return {
    theme,
    terms,
    isThin: terms.length < THIN_FIELD_THRESHOLD,
    gpuUsed,
  };
}

/**
 * Loads a static wordlist file (one term per line) as the lexical field's
 * terms, bypassing dynamic LLM expansion. `theme` is still required and
 * still anchors the analysis (obviousness score, disclaimers) — --lexic
 * only changes where the terms come from, never what's being analyzed for.
 */
export async function loadLexicFile(filePath: string, theme: string): Promise<LexicalFieldResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Lexic file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const terms = [
    ...new Set(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#")),
    ),
  ];

  return {
    theme,
    terms,
    isThin: terms.length < THIN_FIELD_THRESHOLD,
    gpuUsed: null,
  };
}
