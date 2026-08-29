import {
  ANY_GRADIENT_ID,
  FEMALE_COLOUR,
  MALE_COLOUR,
} from "./map-pin";

/**
 * The single definition of the two-tone "any gender" fill.
 *
 * Rendered once per page. Both the React legend and the map pins — which are
 * built as raw DOM inside Kakao overlays, outside React's tree — reference it
 * by id, so there is exactly one gradient in the document and nothing depends
 * on render order.
 */
export function GenderGradientDefs() {
  return (
    <svg width="0" height="0" aria-hidden focusable="false" className="absolute">
      <defs>
        <linearGradient id={ANY_GRADIENT_ID} x1="0" y1="0" x2="1" y2="0">
          {/* A hard stop, not a blend: "both" should read as two colours. */}
          <stop offset="50%" stopColor={MALE_COLOUR} />
          <stop offset="50%" stopColor={FEMALE_COLOUR} />
        </linearGradient>
      </defs>
    </svg>
  );
}
