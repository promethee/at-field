export type PresetName = "fast" | "balanced" | "best";

export interface PresetConfig {
  whisperModel: "tiny" | "base" | "small" | "medium" | "large";
  /** minutes; 0 = unlimited */
  maxDuration: number;
  /** true = require upfront size/runtime confirm before running */
  requiresUpfrontConfirm: boolean;
}

// maxDuration: fast=60min ("under 1h" framing), balanced=120min (covers
// most long-form content), best=0/unlimited (already gated by the
// upfront confirm in cli.ts, so no additional cap makes sense). Confirmed
// values -- see TODO.md history / INTENT.md for prior placeholder status.
export const PRESETS: Record<PresetName, PresetConfig> = {
  fast: {
    whisperModel: "base",
    maxDuration: 60,
    requiresUpfrontConfirm: false,
  },
  balanced: {
    whisperModel: "small",
    maxDuration: 120,
    requiresUpfrontConfirm: false,
  },
  best: {
    whisperModel: "medium",
    maxDuration: 0,
    requiresUpfrontConfirm: true,
  },
};

export function resolvePreset(name: PresetName): PresetConfig {
  return PRESETS[name];
}
