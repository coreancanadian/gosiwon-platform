"use client";

import { useCallback, useRef } from "react";

/**
 * Distinguishes a real user gesture from a map SDK's own "idle" event fired by
 * our own programmatic fitBounds/setCenter calls.
 *
 * Both Kakao's and Google's "idle" fire identically for user panning and for
 * our own view-fitting, and gating on a zoom-changed event does not help
 * either — fitting the view changes the zoom too. This bit us once already on
 * the Kakao map (85 results silently replaced by another district's on first
 * load); a short suppression window around each programmatic move is what
 * actually tells the two apart, so it lives here once rather than being
 * re-derived per provider.
 */
export function useIdleSuppression(windowMs = 900) {
  const suppressUntilRef = useRef(0);

  const suppress = useCallback(() => {
    suppressUntilRef.current = Date.now() + windowMs;
  }, [windowMs]);

  const isSuppressed = useCallback(() => Date.now() < suppressUntilRef.current, []);

  return { suppress, isSuppressed };
}
