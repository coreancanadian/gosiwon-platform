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

// Distinct from both gender colours (blue/pink) and from every property pin,
// so a searched place reads unmistakably as "you are here", not as a listing.
const HIGHLIGHT_COLOUR = "#f97316"; // orange-500

// Classic teardrop "place" marker shape — bigger and shaped differently from
// the round property pins so it can never be mistaken for a listing.
const PLACE_PATH =
  "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z";

/**
 * A big, bright "you are here" marker for the school/city/subway a search
 * started from — a bounding-box outline read as decoration and nobody
 * noticed it; a bold pin with a pulsing ring is unmissable at a glance.
 */
export function buildHighlightPinElement(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.position = "relative";
  el.style.width = "56px";
  el.style.height = "64px";
  el.style.pointerEvents = "none";

  el.innerHTML = `
    <span class="animate-ping" style="position:absolute;left:50%;bottom:2px;width:16px;height:16px;margin-left:-8px;border-radius:9999px;background:${HIGHLIGHT_COLOUR};opacity:0.55;"></span>
    <svg viewBox="0 0 24 24" width="56" height="64" style="position:absolute;inset:0;filter:drop-shadow(0 3px 4px rgba(0,0,0,.45));">
      <path fill="${HIGHLIGHT_COLOUR}" stroke="white" stroke-width="1" d="${PLACE_PATH}"/>
      <circle cx="12" cy="9" r="3.4" fill="white"/>
    </svg>
  `;
  return el;
}
