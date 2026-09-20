// Looks up a model's download size on the Ollama registry, so the pull prompt
// can say how big the download is. The registry speaks the OCI manifest
// protocol; this endpoint is not a documented Ollama API, so every failure
// returns a reason and callers fall back to showing no size.
const REGISTRY = "https://registry.ollama.ai";

export interface ModelRef {
  /** registry path, for example "library/qwen2.5" */
  path: string;
  tag: string;
}

/**
 * Splits "name:tag" or "user/name:tag" into a registry path and tag ("latest"
 * when there is no tag). Returns null for names the registry lookup cannot
 * handle, such as ones that carry a host ("hf.co/user/name").
 */
export function parseModelRef(model: string): ModelRef | null {
  const colon = model.lastIndexOf(":");
  const hasTag = colon > model.lastIndexOf("/");
  const base = hasTag ? model.slice(0, colon) : model;
  const tag = hasTag ? model.slice(colon + 1) : "latest";
  const parts = base.split("/");
  if (!base || !tag || parts.length > 2 || parts.some((p) => p === "")) return null;
  return { path: parts.length === 1 ? `library/${parts[0]}` : base, tag };
}

export type ModelLookup = { ok: true; bytes: number } | { ok: false; reason: string };

/** Fetches the model's manifest and sums the config and layer sizes. */
export async function lookupModel(model: string, timeoutMs = 3000): Promise<ModelLookup> {
  const ref = parseModelRef(model);
  if (!ref) return { ok: false, reason: `"${model}" is not a registry.ollama.ai model name` };

  let res: Response;
  try {
    res = await fetch(`${REGISTRY}/v2/${ref.path}/manifests/${ref.tag}`, {
      headers: { Accept: "application/vnd.docker.distribution.manifest.v2+json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { ok: false, reason: `registry unreachable (${(err as Error).message})` };
  }
  if (res.status === 404) return { ok: false, reason: "no such model or tag on the registry (404)" };
  if (!res.ok) return { ok: false, reason: `registry answered ${res.status}` };

  try {
    const manifest = (await res.json()) as { config?: { size?: number }; layers?: Array<{ size?: number }> };
    const bytes = (manifest.config?.size ?? 0) + (manifest.layers ?? []).reduce((sum, l) => sum + (l.size ?? 0), 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, reason: "the manifest lists no sizes" };
    return { ok: true, bytes };
  } catch {
    return { ok: false, reason: "the manifest is not valid JSON" };
  }
}

/** The size in bytes, or null when the lookup fails for any reason. */
export async function fetchModelSize(model: string, timeoutMs?: number): Promise<number | null> {
  const result = await lookupModel(model, timeoutMs);
  return result.ok ? result.bytes : null;
}

export function formatSize(bytes: number): string {
  return bytes >= 1e9 ? `about ${(bytes / 1e9).toFixed(1)} GB` : `about ${Math.round(bytes / 1e6)} MB`;
}
