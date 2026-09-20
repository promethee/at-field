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
export const THIN_FIELD_THRESHOLD = 8;

// Hard ceiling on theme-expansion generation, passed as Ollama's
// `num_predict`. Real testing of the previous in-process node-llama-cpp
// backend found generation can otherwise run unbounded -- the schema's
// maxItems: 40 constrains the JSON *shape* but not how many tokens the
// model is allowed to spend getting there. 40 short terms in JSON is at
// most a few hundred tokens, so this leaves headroom without allowing a
// runaway.
const MAX_EXPANSION_TOKENS = 1024;

// Words kept in the field unless --field-size says otherwise.
export const DEFAULT_FIELD_SIZE = 25;
// Bounds accepted for --field-size. The upper bound keeps the JSON answer
// well inside MAX_EXPANSION_TOKENS (150 words is roughly 600 tokens).
export const MIN_FIELD_SIZE = 5;
export const MAX_FIELD_SIZE = 100;
// The model is asked for this multiple of the field size, because the
// post-filter removes a large share of what it returns.
const REQUEST_MARGIN = 1.5;

/**
 * Validates the raw --field-size value. Returns undefined when the flag is
 * absent (the default applies); throws with a user-facing message otherwise.
 */
export function parseFieldSize(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_FIELD_SIZE || n > MAX_FIELD_SIZE) {
    throw new Error(`--field-size must be a whole number from ${MIN_FIELD_SIZE} to ${MAX_FIELD_SIZE}, got "${raw}"`);
  }
  return n;
}

function fieldSchema(maxItems: number) {
  return {
    type: "object",
    properties: {
      terms: { type: "array", items: { type: "string" }, minItems: 1, maxItems },
    },
    required: ["terms"],
  } as const;
}

/**
 * Checks whether `model` is already pulled in the local Ollama install,
 * and offers to pull it (via the `ollama` CLI itself, not reimplemented
 * download logic) if not. Throws with actionable next steps for every
 * failure mode: server unreachable, user declines, or the pull itself
 * fails (e.g. `ollama` not on PATH).
 */
export async function ensureModelPulled(
  model: string,
  deps: { confirm: typeof confirm; pullModel: (model: string) => Promise<void> } = { confirm, pullModel },
): Promise<void> {
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

  const proceed = await deps.confirm(`Model "${model}" isn't pulled in Ollama yet. Pull it now?`, true);
  if (!proceed) {
    throw new Error(`Aborted: run \`ollama pull ${model}\` yourself, then retry.`);
  }

  console.log(`Pulling "${model}" via Ollama...`);
  await deps.pullModel(model);
}

/** Runs `ollama pull` with inherited stdio so the user sees Ollama's own progress. */
export function pullModel(model: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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
 * Reads Ollama's streamed /api/generate response (one JSON object per line)
 * and returns the concatenated text. Streaming matters: Node's fetch gives up
 * after 5 minutes without a byte, and a non-streamed request sends nothing
 * until generation finishes, which a slow CPU can exceed (found on real
 * hardware: a 3B model ran 5m13s and the request was cut).
 */
async function readGenerateStream(res: Response): Promise<string> {
  if (!res.body) throw new Error("Ollama returned an empty response.");
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as { response?: string; error?: string };
    if (chunk.error) throw new Error(`Ollama request failed: ${chunk.error}`);
    text += chunk.response ?? "";
  };
  try {
    for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(part, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    handleLine(buffer);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Ollama request failed")) throw err;
    throw new Error(`Ollama stopped responding mid-generation. (${(err as Error).message})`);
  }
  return text;
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
  options: { language?: string; model?: string; size?: number } = {},
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

  // Ask for more words than the field will hold: the post-filter below drops
  // phrases, variants and the theme's own words (about a third of a 3B model's
  // output in testing), then the field is trimmed to `size`.
  const size = options.size ?? DEFAULT_FIELD_SIZE;
  const requested = Math.ceil(size * REQUEST_MARGIN);

  // Plain-words wording (tested against an earlier "commonly associated /
  // clearly different" prompt on a 3B model): fields became readable
  // everyday vocabulary (god, bible, pray, church) instead of rare words
  // (eschatology, sacerdotal). The example theme is deliberately unrelated
  // to anything a user is likely to analyse.
  const prompt =
    `List the lexical field of the theme "${theme}": the plain, everyday words a speaker or writer ` +
    `on this theme would actually use, such as common nouns, verbs and adjectives. ` +
    `For example, for the theme "cooking": stir, oven, recipe, boil, sharp, hungry. ` +
    `Avoid rare, technical or literary words. Every entry is exactly one word. ` +
    `Do not repeat the theme's own words. ` +
    languageRule +
    `Give ${requested} words.`;

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        format: fieldSchema(requested),
        stream: true,
        // Fixed seed: the same theme, model and language give the same field,
        // so a score can be compared between runs (Ollama's default gave a new
        // field every run). Temperature stays at the default on purpose:
        // temperature 0 made a small model stop after 3 terms instead of ~24.
        options: { num_predict: MAX_EXPANSION_TOKENS, seed: 0 },
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

  const raw = await readGenerateStream(res);

  let parsed: { terms: string[] };
  try {
    parsed = JSON.parse(raw) as { terms: string[] };
  } catch {
    throw new Error(
      `Theme expansion produced incomplete output (likely hit the ${MAX_EXPANSION_TOKENS}-token cap before ` +
        `finishing). Try a narrower theme, or retry.`,
    );
  }
  const terms = cleanExpandedTerms(parsed.terms, theme).slice(0, size);

  return {
    theme,
    terms,
    isThin: terms.length < THIN_FIELD_THRESHOLD,
  };
}

// A term sharing this many leading letters with an already-kept term is
// treated as a variant of it (inflection/derivation) and dropped. Deliberately
// conservative: real French output padded a field with lecture/lectrices,
// voyage/voyageur/voyageuse, photographie/photographe/photographique, which
// inflates the field size and deflates saturation. 5 avoids most false merges
// of distinct short roots (jeu/jeune, parc/parce, art/article, chat/chateau)
// at the cost of missing variants of short roots (art/artistes,
// lecture/lecteur). Known false merge at 5: marché/marchandise. See INTENT.md.
const MIN_SHARED_PREFIX = 5;

function sharedPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Post-filters the model's raw terms. Matching against the transcript is
 * literal and word-by-word, so multi-word phrases can never match unless
 * spoken verbatim -- they only add noise. Small models ignore a "single
 * words only" instruction often enough (real French testing returned
 * phrases like "croissance du secteur du travail") that this is enforced
 * here rather than trusted to the prompt. Also drops:
 * - exact duplicates, case- and accent-insensitively;
 * - variants of an already-kept term (see MIN_SHARED_PREFIX), keeping the
 *   first one the model listed -- so the field measures breadth, not one
 *   root repeated in many forms;
 * - the theme's own words: a hit on the theme's own vocabulary would inflate
 *   saturation with evidence the theme already implies (circular -- see
 *   INTENT.md).
 * Dynamic expansion only -- --lexic lists are the user's own and left
 * untouched.
 */
export function cleanExpandedTerms(raw: string[], theme = ""): string[] {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
  const themeWords = new Set(fold(theme).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const keptKeys: string[] = [];
  const out: string[] = [];
  for (const t of raw) {
    const term = t.trim();
    if (!term || /\s/.test(term)) continue;
    const key = fold(term);
    if (themeWords.has(key)) continue;
    if (keptKeys.some((k) => k === key || sharedPrefixLength(k, key) >= MIN_SHARED_PREFIX)) continue;
    keptKeys.push(key);
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
