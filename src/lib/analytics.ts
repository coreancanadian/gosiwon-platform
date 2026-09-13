"use client";

import { sendGAEvent } from "@next/third-parties/google";

export type UserRole = "tenant" | "owner";

/**
 * Fired the moment signUp() succeeds — before email confirmation, since
 * that's when the account row actually lands in auth.users. `role` also
 * gets set as a GA4 user property, so later events in the same session
 * (search, message_sent) can be segmented by tenant vs owner without each
 * one needing to know or re-send it.
 */
export function trackSignUp(role: UserRole) {
  sendGAEvent("event", "sign_up", { method: "email", role });
  sendGAEvent("set", "user_properties", { user_type: role });
}

/** A free-text keyword search from the home/search box (not a tap on a
 *  suggested region/station/university — that's a pick, not a keyword). */
export function trackSearch(term: string) {
  sendGAEvent("event", "search", { search_term: term });
}

/**
 * A message landing in an inquiry thread. `isFirstMessage` is true only for
 * the message that opens a brand-new inquiry (one per tenant+listing) —
 * false for every reply after that. GA can report "unique" conversations
 * started (filter is_first_message=true) alongside total message volume
 * (every message_sent) from this one event.
 */
export function trackMessageSent(isFirstMessage: boolean) {
  sendGAEvent("event", "message_sent", { is_first_message: isFirstMessage });
}
