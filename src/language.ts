import { franc } from "franc-min";
import { iso6393To1 } from "iso-639-3";

export type LanguageMatchResult = "match" | "mismatch" | "ambiguous";

/**
 * Detects the language of a short string (typically a --theme value) and
 * returns it as an ISO 639-1 code (matching Whisper's own language codes).
 * Short strings (a word or two) are often undetectable -- franc returns
 * "und" -- in which case confident is false rather than guessing.
 */
export function detectLanguageCode(text: string): { code: string | null; confident: boolean } {
  const iso3 = franc(text);
  if (iso3 === "und") {
    return { code: null, confident: false };
  }
  const iso1 = iso6393To1[iso3 as keyof typeof iso6393To1];
  if (!iso1) {
    // Detected a real ISO 639-3 language with no 2-letter equivalent
    // (outside Whisper's supported set) -- nothing meaningful to compare.
    return { code: null, confident: false };
  }
  return { code: iso1, confident: true };
}

/**
 * Compares a --theme string's detected language against the audio's
 * language code (either explicitly set via --language, or Whisper's own
 * auto-detected result). "ambiguous" means detection wasn't confident
 * enough to call it either way -- callers should warn, not block.
 */
export function checkLanguageMatch(theme: string, audioLanguageCode: string): LanguageMatchResult {
  const { code, confident } = detectLanguageCode(theme);
  if (!confident) return "ambiguous";
  return code === audioLanguageCode ? "match" : "mismatch";
}

// whisper.cpp writes this line to stderr on auto-detection, e.g.:
// "whisper_full_with_state: auto-detected language: en (p = 0.988642)"
const WHISPER_AUTO_DETECT_LINE = /auto-detected language:\s*([a-z]{2,3})/i;

/**
 * Scans captured whisper.cpp log lines (stderr, routed through a custom
 * logger -- see transcribe.ts) for the auto-detected-language line. Only
 * present when Whisper was run in auto-detect mode.
 */
export function extractWhisperDetectedLanguage(logLines: string[]): string | null {
  for (const line of logLines) {
    const match = WHISPER_AUTO_DETECT_LINE.exec(line);
    if (match) return match[1].toLowerCase();
  }
  return null;
}
