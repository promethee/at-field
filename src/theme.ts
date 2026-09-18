import fs from "node:fs";
import { spawn } from "node:child_process";
import { confirm } from "./confirm.js";
import type { LexicalFieldResult } from "./types.js";

// Small instruct model, good enough for a bounded JSON-list generation task.
// Pulled and run by the user's own local Ollama install -- see README.
const DEFAULT_MODEL = "qwen2.5:0.5b";

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
export async function expandTheme(theme: string, model: string = DEFAULT_MODEL): Promise<LexicalFieldResult> {
  await ensureModelPulled(model);

  const prompt =
    `List the lexical field of the theme/topic "${theme}": words and short phrases ` +
    `commonly associated with it (not just synonyms of the theme word itself). ` +
    `Return 15-30 distinct terms if the theme is broad enough to support that many; ` +
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
  const terms = [...new Set(parsed.terms.map((t) => t.trim()).filter(Boolean))];

  return {
    theme,
    terms,
    isThin: terms.length < THIN_FIELD_THRESHOLD,
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
  };
}
