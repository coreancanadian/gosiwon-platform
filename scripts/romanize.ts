/**
 * Revised Romanization of Korean — enough of it to make readable URL slugs.
 *
 * Used to turn station names discovered from Kakao (신대방역, 선정릉역) into
 * slugs (sindaebang, seonjeongneung) so their search URLs read like the
 * hand-written ones. Transliteration only: the inter-syllable assimilation
 * rules are not applied, which is fine for a slug but would not be for
 * displaying a name.
 */

// prettier-ignore
const INITIAL = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp",
  "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
];

// prettier-ignore
const MEDIAL = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae",
  "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];

// prettier-ignore
const FINAL = [
  "", "k", "k", "ks", "n", "nj", "nh", "t", "l", "lk", "lm", "lb", "ls",
  "lt", "lp", "lh", "m", "p", "ps", "t", "t", "ng", "t", "t", "k", "t", "p", "h",
];

const SYLLABLE_START = 0xac00;
const SYLLABLE_END = 0xd7a3;

export function romanize(text: string): string {
  let out = "";

  for (const char of text) {
    const code = char.codePointAt(0)!;

    if (code < SYLLABLE_START || code > SYLLABLE_END) {
      // Latin, digits, spaces pass through; anything else is dropped.
      out += /[a-zA-Z0-9]/.test(char) ? char.toLowerCase() : " ";
      continue;
    }

    const offset = code - SYLLABLE_START;
    out += INITIAL[Math.floor(offset / 588)];
    out += MEDIAL[Math.floor((offset % 588) / 28)];
    out += FINAL[offset % 28];
  }

  return out;
}

/** Romanized, hyphenated, URL-safe. */
export function slugifyKorean(text: string): string {
  return romanize(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * "신대방역 2호선" -> { name: "신대방역", line: "2호선" }
 *
 * Kakao lists one row per line serving a station, so the line has to come off
 * the name before stations can be deduplicated.
 */
export function splitStationName(placeName: string): {
  name: string;
  line: string | null;
} {
  const parts = placeName.trim().split(/\s+/);
  if (parts.length < 2) return { name: parts[0] ?? placeName, line: null };

  // Everything after the first token is the line ("2호선", "수인분당선", "신림선").
  const name = parts[0];
  const line = parts.slice(1).join(" ");
  return { name, line: line || null };
}

/**
 * Straight-line metres -> estimated walking minutes.
 *
 * Korea's advertising rules put 도보 1분 at 80m of *walking* distance. Kakao
 * gives straight-line distance, so a detour factor is applied first; rounding
 * up keeps the estimate on the conservative side rather than overselling how
 * close a listing is.
 */
export const DETOUR_FACTOR = 1.3;
export const METRES_PER_MINUTE = 80;

export function walkMinutesFrom(straightLineMetres: number): number {
  return Math.max(1, Math.ceil((straightLineMetres * DETOUR_FACTOR) / METRES_PER_MINUTE));
}
