// Words that share a stem count as forms of one word. A stem is a word's first
// `stemLength` letters, compared after folding case and accents. It is a rough,
// language-agnostic stand-in for real stemming, tuned to be conservative:
// 5 letters avoids merging distinct short roots (jeu/jeune, parc/parce,
// art/article) at the cost of missing variants of short roots (art/artistes,
// lecture/lecteur) and one known false merge (marché/marchandise).
export const DEFAULT_STEM_LENGTH = 5;
export const MIN_STEM_LENGTH = 3;
export const MAX_STEM_LENGTH = 12;

/** Lowercases and strips accents, so "Économie" and "economie" compare equal. */
export function foldWord(word: string): string {
  return word.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

export function sharedPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** True for identical words, and for words sharing `stemLength` leading letters (0 turns stems off). */
export function shareStem(a: string, b: string, stemLength: number): boolean {
  return a === b || (stemLength > 0 && sharedPrefixLength(a, b) >= stemLength);
}

/**
 * Validates the raw --stem-length value. Returns undefined when the flag is
 * absent (the default applies); throws with a user-facing message otherwise.
 */
export function parseStemLength(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  // Number("") is 0, which would silently mean "off".
  const n = raw.trim() === "" ? Number.NaN : Number(raw);
  const valid = Number.isInteger(n) && (n === 0 || (n >= MIN_STEM_LENGTH && n <= MAX_STEM_LENGTH));
  if (!valid) {
    throw new Error(
      `--stem-length must be 0 (off) or a whole number from ${MIN_STEM_LENGTH} to ${MAX_STEM_LENGTH}, got "${raw}"`,
    );
  }
  return n;
}
