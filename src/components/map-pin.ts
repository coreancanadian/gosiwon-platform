import type { GenderPolicy } from "@/lib/types/database";

/**
 * Map pins show WHO a place accepts, not what it costs.
 *
 * Gender is the first hard filter for this audience — a female-only 고시원 is
 * simply not an option for half of searchers — whereas price is already on
 * every card in the list beside the map. A wall of numbers also reads as noise
 * at a glance; a wall of colour reads as a map.
 */
export const MALE_COLOUR = "#2563eb"; // blue-600
export const FEMALE_COLOUR = "#ec4899"; // pink-500

/**
 * One fixed id, defined once by <GenderGradientDefs />.
 *
 * An earlier version generated a fresh id per icon from a module counter, which
 * meant the server and client produced different markup for the same legend and
 * React reported a hydration mismatch it "won't patch up" — taking the element
 * refs down with it. Deterministic output is the whole requirement here.
 */
export const ANY_GRADIENT_ID = "pin-gender-any";

const PERSON_PATH =
  "M12 12.4a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Zm0 1.8c-3.6 0-7.6 1.85-7.6 4.6V20h15.2v-1.2c0-2.75-4-4.6-7.6-4.6Z";

export function genderFill(gender: GenderPolicy): string {
  if (gender === "male") return MALE_COLOUR;
  if (gender === "female") return FEMALE_COLOUR;
  return `url(#${ANY_GRADIENT_ID})`;
}

export function personSvg(gender: GenderPolicy, size = 17): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="${genderFill(gender)}" d="${PERSON_PATH}"/></svg>`;
}

export interface PinOptions {
  gender: GenderPolicy;
  label: string;
  isActive: boolean;
  isSelected: boolean;
}

export function buildPinElement({
  gender,
  label,
  isActive,
  isSelected,
}: PinOptions): HTMLElement {
  const el = document.createElement("div");
  el.title = label;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", label);

  const ring = isSelected
    ? "border-ink-900 ring-2 ring-ink-900/25"
    : isActive
      ? "border-ink-700"
      : "border-white";

  el.className = [
    "flex h-8 w-8 cursor-pointer items-center justify-center rounded-full",
    "border-2 bg-white shadow-md transition-transform duration-150",
    ring,
    isActive || isSelected ? "scale-115" : "hover:scale-110",
  ].join(" ");

  el.innerHTML = personSvg(gender);
  return el;
}

/** Legend swatch, same iconography as the pins. */
export function genderSwatch(gender: GenderPolicy): string {
  return personSvg(gender, 14);
}
