import { romanizeHangul } from "./romanize-ko";
import type { Locale } from "@/i18n/routing";

/**
 * English display text for Korean names and addresses.
 *
 * Most listings carry hand-checked name_en / address_en, but plenty don't (a
 * dong-level address can't be reverse-geocoded, and not every name was
 * translated). Rather than show Hangul to an English reader, fall back to the
 * Korean *sound* written in Latin letters — Revised Romanization, which also
 * applies pronunciation changes (신림 → Sillim), so it reads as people say it.
 */

const PROVINCES: Record<string, string> = {
  서울: "Seoul",
  부산: "Busan",
  대구: "Daegu",
  인천: "Incheon",
  광주: "Gwangju",
  대전: "Daejeon",
  울산: "Ulsan",
  세종: "Sejong",
  경기: "Gyeonggi-do",
  경기도: "Gyeonggi-do",
  강원: "Gangwon-do",
  강원특별자치도: "Gangwon-do",
  충북: "Chungbuk",
  충남: "Chungnam",
  전북: "Jeonbuk",
  전북특별자치도: "Jeonbuk",
  전남: "Jeonnam",
  전남광주통합특별시: "Jeonnam-Gwangju",
  경북: "Gyeongbuk",
  경남: "Gyeongnam",
  제주: "Jeju",
  제주특별자치도: "Jeju",
};

/** Administrative / road endings that read better split off with a hyphen. */
const SUFFIXES: Record<string, string> = {
  시: "si",
  군: "gun",
  구: "gu",
  읍: "eup",
  면: "myeon",
  동: "dong",
  리: "ri",
  로: "ro",
  길: "gil",
  가: "ga",
};

const HANGUL = /[가-힣]/;
// Runs of Hangul, runs of digits, or anything else — in that order of care.
const SEGMENT = /[가-힣]+|\d+|[^가-힣\d]+/g;

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function romanizeWord(hangul: string): string {
  return capitalize(romanizeHangul(hangul));
}

/**
 * Words every listing name leans on. Spelled out by sound they look odd
 * ("Sweeohauseu"), so these read as the English a visitor expects. Longer
 * entries come first so 쉐어하우스 wins over 하우스.
 */
const COMMON_WORDS: [string, string][] = [
  ["쉐어하우스", "Share House"],
  ["셰어하우스", "Share House"],
  ["쉐어", "Share"],
  ["하우스", "House"],
  ["고시원", "Gosiwon"],
  ["고시텔", "Gositel"],
  ["원룸텔", "Oneroom-tel"],
  ["리빙텔", "Livingtel"],
  ["코리빙", "Coliving"],
  ["레지던스", "Residence"],
  ["스튜디오", "Studio"],
  ["스테이", "Stay"],
];
const COMMON_WORD_PATTERN = new RegExp(
  `(${COMMON_WORDS.map(([ko]) => ko).join("|")})`,
);

/** Romanize a listing-name word, swapping common words for English ones. */
function romanizeNameWord(hangul: string): string {
  const pieces = hangul.split(COMMON_WORD_PATTERN).filter(Boolean);
  return pieces
    .map((piece) => {
      const common = COMMON_WORDS.find(([ko]) => ko === piece);
      return common ? common[1] : romanizeWord(piece);
    })
    .join(" ");
}

/** "신림동" → "Sillim-dong"; plain words fall through to `romanizeWord`. */
function romanizeAddressWord(hangul: string): string {
  const province = PROVINCES[hangul];
  if (province) return province;

  const last = hangul.slice(-1);
  const suffix = SUFFIXES[last];
  if (suffix && hangul.length > 1) {
    return `${romanizeWord(hangul.slice(0, -1))}-${suffix}`;
  }
  return romanizeWord(hangul);
}

/** "서울 성북구 동선동4가" → "Seoul Seongbuk-gu Dongseon-dong 4-ga". */
export function romanizeAddress(address: string): string {
  const parts = address.match(SEGMENT) ?? [];
  let out = "";

  parts.forEach((part, i) => {
    if (!HANGUL.test(part)) {
      // "동선동4가" → "Dongseon-dong 4-ga": a number after a word is its own word.
      const prevIsWord = HANGUL.test(parts[i - 1] ?? "");
      out += prevIsWord && /^\d/.test(part) ? ` ${part}` : part;
      return;
    }

    // A lone ending right after a number — "4가", "23길", "6로" — attaches to
    // the number rather than standing as its own word.
    const afterDigit = /\d$/.test(parts[i - 1] ?? "");
    if (afterDigit) {
      // "269번길" / "7안길" are numbered side streets: 269beon-gil, 7an-gil.
      const side = part.match(/^(번|안)길/);
      if (side) {
        out += `${side[1] === "번" ? "beon" : "an"}-gil${part.slice(2) ? ` ${romanizeAddressWord(part.slice(2))}` : ""}`;
        return;
      }
      const suffix = SUFFIXES[part.charAt(0)];
      if (suffix) {
        out += `-${suffix}`;
        const rest = part.slice(1);
        if (rest) out += ` ${romanizeAddressWord(rest)}`;
        return;
      }
    }

    out += romanizeAddressWord(part);
  });

  return out.replace(/\s+/g, " ").trim();
}

/**
 * "잠자리 5호점(성신여대1)" → "Jamjari 5-Hojeom (Seongsinyeodae 1)".
 * Latin text and digits in the original pass through untouched.
 */
export function romanizeName(name: string): string {
  const parts = name.match(SEGMENT) ?? [];
  let out = "";

  parts.forEach((part, i) => {
    if (!HANGUL.test(part)) {
      // Keep a bracket from sticking to the word before it: "A(B)" → "A (B)".
      out += part === "(" && out && !out.endsWith(" ") ? " (" : part;
      return;
    }

    const prev = parts[i - 1] ?? "";
    // "5호점", "1호" — the number is a prefix of the word, so join them.
    // "성신여대1" is the reverse and is handled by the digit branch below.
    const joinToDigit = /\d$/.test(prev);
    // "동덕여대점" → "Dongdeogyeodae-jeom": a trailing 점 is "branch".
    const branch = part.length > 2 && part.endsWith("점");
    const word = branch
      ? `${romanizeNameWord(part.slice(0, -1))}-jeom`
      : romanizeNameWord(part);

    // "K하이스텔" — Latin text and a Korean word are separate words.
    const afterLatin = /[A-Za-z]$/.test(prev);
    out += joinToDigit ? `-${word}` : afterLatin ? ` ${word}` : word;
  });

  // A number that directly follows Hangul reads as its own word.
  return out
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

type NamedProperty = { name_ko: string; name_en: string | null };
type AddressedProperty = { address_ko: string; address_en: string | null };

/** Locale-appropriate listing name; never shows Hangul to an English reader. */
export function displayName(p: NamedProperty, locale: Locale | string): string {
  if (locale === "ko") return p.name_ko;
  // Stored English can still carry stray Hangul (e.g. a Google-geocoded
  // building name), so even a present value goes through the romanizer.
  const en = p.name_en;
  return en && !HANGUL.test(en) ? en : romanizeName(en || p.name_ko);
}

export function displayAddress(
  p: AddressedProperty,
  locale: Locale | string,
): string {
  if (locale === "ko") return p.address_ko;
  const en = p.address_en;
  return en && !HANGUL.test(en) ? en : romanizeAddress(en || p.address_ko);
}
