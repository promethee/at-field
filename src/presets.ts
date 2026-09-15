export type PresetName = "fast" | "balanced" | "best";

export interface PresetConfig {
  whisperModel: "tiny" | "base" | "small" | "medium" | "large";
  /** minutes; 0 = unlimited */
  maxDuration: number;
  /** true = require upfront size/runtime confirm before running */
  requiresUpfrontConfirm: boolean;
}

// Values below are placeholders — max-duration default and best-preset
// thresholds are still open decisions (see TODO.md "Open decisions").
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
