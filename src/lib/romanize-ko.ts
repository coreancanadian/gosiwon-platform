/**
 * Revised Romanization of Korean for display, with the pronunciation changes
 * that make a name read the way it is said: 신림 → Sillim, 종로 → Jongno,
 * 학원 → Hagwon, 같이 → Gachi.
 *
 * Browser-safe (no Node imports) so it can run inside client components.
 * Deliberately follows RR's proper-noun conventions: tensification and
 * ㅎ-aspiration after ㄱ/ㄷ/ㅂ are not written out (합정 stays Hapjeong,
 * 묵호 stays Mukho).
 *
 * `scripts/romanize.ts` is the simpler slug-only transliteration.
 */

const SYLLABLE_START = 0xac00;
const SYLLABLE_END = 0xd7a3;
const SILENT_INITIAL = 11; // ㅇ
const INITIAL_N = 2; // ㄴ
const INITIAL_R = 5; // ㄹ
const INITIAL_M = 6; // ㅁ
const MEDIAL_I = 20; // ㅣ
const FINAL_D = 7; // ㄷ
const FINAL_T = 25; // ㅌ

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

/**
 * Per final consonant (index = jongseong): how it sounds at the end of a
 * syllable (`end`), and — when a vowel follows — what stays behind as a coda
 * and what moves onto the next syllable (`link`).
 */
const FINAL: { end: string; link: [string, string] }[] = [
  { end: "", link: ["", ""] },
  { end: "k", link: ["", "g"] }, // ㄱ
  { end: "k", link: ["", "kk"] }, // ㄲ
  { end: "k", link: ["k", "s"] }, // ㄳ
  { end: "n", link: ["", "n"] }, // ㄴ
  { end: "n", link: ["n", "j"] }, // ㄵ
  { end: "n", link: ["n", ""] }, // ㄶ
  { end: "t", link: ["", "d"] }, // ㄷ
  { end: "l", link: ["", "r"] }, // ㄹ
  { end: "k", link: ["l", "g"] }, // ㄺ
  { end: "m", link: ["l", "m"] }, // ㄻ
  { end: "l", link: ["l", "b"] }, // ㄼ
  { end: "l", link: ["l", "s"] }, // ㄽ
  { end: "l", link: ["l", "t"] }, // ㄾ
  { end: "p", link: ["l", "p"] }, // ㄿ
  { end: "l", link: ["l", ""] }, // ㅀ
  { end: "m", link: ["", "m"] }, // ㅁ
  { end: "p", link: ["", "b"] }, // ㅂ
  { end: "p", link: ["p", "s"] }, // ㅄ
  { end: "t", link: ["", "s"] }, // ㅅ
  { end: "t", link: ["", "ss"] }, // ㅆ
  { end: "ng", link: ["ng", ""] }, // ㅇ
  { end: "t", link: ["", "j"] }, // ㅈ
  { end: "t", link: ["", "ch"] }, // ㅊ
  { end: "k", link: ["", "k"] }, // ㅋ
  { end: "t", link: ["", "t"] }, // ㅌ
  { end: "p", link: ["", "p"] }, // ㅍ
  { end: "t", link: ["", ""] }, // ㅎ
];

/** Romanize one run of Hangul syllables (no spaces or punctuation). */
export function romanizeHangul(word: string): string {
  const syllables: { l: number; v: number; t: number }[] = [];
  for (const char of word) {
    const code = char.codePointAt(0)!;
    if (code < SYLLABLE_START || code > SYLLABLE_END) continue;
    const offset = code - SYLLABLE_START;
    syllables.push({
      l: Math.floor(offset / 588),
      v: Math.floor((offset % 588) / 28),
      t: offset % 28,
    });
  }

  let out = "";
  // The previous syllable's final consonant can rewrite this one's onset.
  let carry: string | null = null;

  syllables.forEach((s, i) => {
    out += (carry ?? INITIAL[s.l]) + MEDIAL[s.v];
    carry = null;
    if (!s.t) return;

    const final = FINAL[s.t];
    const next = syllables[i + 1];
    if (!next) {
      out += final.end;
      return;
    }

    // Vowel follows: the consonant slides onto the next syllable (liaison),
    // except ㄷ/ㅌ before 이, which soften to j / ch (같이 → gachi).
    if (next.l === SILENT_INITIAL) {
      if (next.v === MEDIAL_I && (s.t === FINAL_D || s.t === FINAL_T)) {
        carry = s.t === FINAL_D ? "j" : "ch";
      } else {
        out += final.link[0];
        carry = final.link[1];
      }
      return;
    }

    if (next.l === INITIAL_N || next.l === INITIAL_M) {
      // Nasal assimilation: ㄱ/ㄷ/ㅂ before ㄴ/ㅁ sound as ㅇ/ㄴ/ㅁ.
      if (final.end === "k") out += "ng";
      else if (final.end === "t") out += "n";
      else if (final.end === "p") out += "m";
      else if (final.end === "l" && next.l === INITIAL_N) {
        out += "l";
        carry = "l"; // ㄹ+ㄴ → ㄹㄹ
      } else out += final.end;
      return;
    }

    if (next.l === INITIAL_R) {
      if (final.end === "n" || final.end === "l") {
        out += "l";
        carry = "l"; // 신림 → Sillim
      } else {
        // ㄱ/ㅇ/ㅁ/ㅂ/ㄷ before ㄹ: the ㄹ is pronounced ㄴ (종로 → Jongno).
        out += final.end === "k" ? "ng" : final.end === "t" ? "n" : final.end;
        carry = "n";
        if (final.end === "p") out = out.slice(0, -1) + "m";
      }
      return;
    }

    out += final.end;
  });

  return out;
}
