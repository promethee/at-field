import fs from "node:fs";
import { spawn } from "node:child_process";
import { confirm } from "./confirm.js";
import type { LexicalFieldResult } from "./types.js";

// 3B: real French testing showed sub-1B models (qwen2.5:0.5b, minicpm-v4.6)
// return junk terms and score 0; qwen2.5:3b gave usable fields. ~1.9 GB.
// Pulled and run by the user's own local Ollama install -- see README.
const DEFAULT_MODEL = "qwen2.5:3b";

// OLLAMA_HOST is Ollama's own env var convention, but its value isn't
// guaranteed to be a full URL -- e.g. found set to bare "0.0.0.0" (no
// scheme, no port) in real testing, which crashed url parsing instead of
// producing the clean "can't reach Ollama" error below. Normalize instead
// of trusting it as-is.
function resolveOllamaHost(): string {
  const raw = process.env.OLLAMA_HOST?.trim();
  if (!raw) return "http://localhost:11434";
  const withScheme = /^https?:\/\//.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!url.port) url.port = "11434";
    return url.origin;
  } catch {
    return "http://localhost:11434";
  }
}

const OLLAMA_HOST = resolveOllamaHost();

// Below this term count, the expanded field is flagged as thin (see
// INTENT.md — likely indicates a narrow subject rather than a broad theme,
// or a prompt/model limitation). Heuristic, not exact.
const THIN_FIELD_THRESHOLD = 8;

// Hard ceiling on theme-expansion generation, passed as Ollama's
// `num_predict`. Real testing of the previous in-process node-llama-cpp
// backend found generation can otherwise run unbounded -- the schema's
// maxItems: 40 constrains the JSON *shape* but not how many tokens the
// model is allowed to spend getting there. 40 short terms in JSON is at
// most a few hundred tokens, so this leaves headroom without allowing a
// runaway.
const MAX_EXPANSION_TOKENS = 1024;

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
 * Checks whether `model` is already pulled in the local Ollama install,
 * and offers to pull it (via the `ollama` CLI itself, not reimplemented
 * download logic) if not. Throws with actionable next steps for every
 * failure mode: server unreachable, user declines, or the pull itself
 * fails (e.g. `ollama` not on PATH).
 */
async function ensureModelPulled(model: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/tags`);
  } catch (err) {
    throw new Error(
      `Could not reach a local Ollama server at ${OLLAMA_HOST}. Install Ollama (https://ollama.com) and make ` +
        `sure \`ollama serve\` is running. (${(err as Error).message})`,
    );
  }
  if (!res.ok) {
    throw new Error(`Ollama request failed (${res.status}): ${res.statusText}`);
  }

  const data = (await res.json()) as { models?: Array<{ name: string; model: string }> };
  const known = new Set((data.models ?? []).flatMap((m) => [m.name, m.model]));
  const wantsLatest = !model.includes(":");
  if (known.has(model) || (wantsLatest && known.has(`${model}:latest`))) {
    return;
  }

  const proceed = await confirm(`Model "${model}" isn't pulled in Ollama yet. Pull it now?`, true);
  if (!proceed) {
    throw new Error(`Aborted: run \`ollama pull ${model}\` yourself, then retry.`);
  }

  console.log(`Pulling "${model}" via Ollama...`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ollama", ["pull", model], { stdio: "inherit" });
    child.on("error", (err) => {
      reject(
        new Error(
          `Could not run \`ollama pull ${model}\` (is \`ollama\` on your PATH?). Pull it manually and retry. (${err.message})`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`\`ollama pull ${model}\` exited with code ${code}. Pull it manually and retry.`));
    });
  });
}

/**
 * Expands a user-supplied theme into a lexical field using a local Ollama
 * server (a separately-installed, separately-maintained binary -- not an
 * in-process native npm binding). Output is constrained to a JSON schema
 * via Ollama's structured-output support, so parsing never fails on
 * free-text drift.
 *
 * Previously used node-llama-cpp in-process. Dropped after it joined
 * nodejs-whisper and @fugood/whisper.node as a third native ML binding to
 * cause a severe failure in this project (real-hardware testing found
 * generation could stall indefinitely on CPU with no progress at all) --
 * see INTENT.md for the full pattern across all three.
 */
export async function expandTheme(
  theme: string,
  options: { language?: string; model?: string } = {},
): Promise<LexicalFieldResult> {
  const model = options.model ?? DEFAULT_MODEL;
  await ensureModelPulled(model);

  // Matching is literal word-boundary against the transcript, so terms in
  // the wrong language score 0 -- the model must be told which language to
  // answer in, or it defaults to the (English) prompt's language.
  const languageName = options.language
    ? new Intl.DisplayNames(["en"], { type: "language" }).of(options.language)
    : undefined;
  const languageRule = languageName
    ? `Write every term in ${languageName}, even if the theme is given in another language. `
    : `Write the terms in the same language as the theme. `;

  const prompt =
    `List the lexical field of the theme/topic "${theme}": single words commonly associated with it ` +
    `(nouns, verbs, adjectives -- not just synonyms of the theme word itself). ` +
    `Every entry must be exactly ONE word: no phrases, no expressions, no compound descriptions. ` +
    `Every entry must be clearly different from the others: no variations, inflections or ` +
    `rewordings of the same idea, and do not build entries by repeating the theme's own words. ` +
    languageRule +
    `Return 15-30 terms if the theme is broad enough to support that many; ` +
    `fewer is fine for a genuinely narrow theme.`;

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        format: FIELD_SCHEMA,
        stream: false,
        options: { num_predict: MAX_EXPANSION_TOKENS },
      }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach a local Ollama server at ${OLLAMA_HOST}. Install Ollama (https://ollama.com), run ` +
        `\`ollama pull ${model}\`, and make sure \`ollama serve\` is running. (${(err as Error).message})`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new Error(`Ollama model "${model}" isn't pulled yet. Run: ollama pull ${model}`);
    }
    throw new Error(`Ollama request failed (${res.status}): ${body || res.statusText}`);
  }

  const data = (await res.json()) as { response: string };

  let parsed: { terms: string[] };
  try {
    parsed = JSON.parse(data.response) as { terms: string[] };
  } catch {
    throw new Error(
      `Theme expansion produced incomplete output (likely hit the ${MAX_EXPANSION_TOKENS}-token cap before ` +
        `finishing). Try a narrower theme, or retry.`,
    );
  }
  const terms = cleanExpandedTerms(parsed.terms, theme);

  return {
    theme,
    terms,
    isThin: terms.length < THIN_FIELD_THRESHOLD,
  };
}

/**
 * Post-filters the model's raw terms. Matching against the transcript is
 * literal and word-by-word, so multi-word phrases can never match unless
 * spoken verbatim -- they only add noise. Small models ignore a "single
 * words only" instruction often enough (real French testing returned
 * phrases like "croissance du secteur du travail") that this is enforced
 * here rather than trusted to the prompt. Also dedupes case- and
 * accent-insensitively, and drops any of the theme's own words: a hit on
 * the theme's own vocabulary would inflate saturation with evidence the
 * theme already implies (circular -- see INTENT.md). Dynamic expansion
 * only -- --lexic lists are the user's own and left untouched.
 */
export function cleanExpandedTerms(raw: string[], theme = ""): string[] {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
  const themeWords = new Set(fold(theme).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const term = t.trim();
    if (!term || /\s/.test(term)) continue;
    const key = fold(term);
    if (themeWords.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

/**
 * Loads a static wordlist file (one term per line) as the lexical field's
 * terms, bypassing dynamic LLM expansion. `theme` is still required and
 * still anchors the analysis (saturation score, disclaimers) — --lexic
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
  };
}
