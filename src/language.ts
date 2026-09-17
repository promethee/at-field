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
