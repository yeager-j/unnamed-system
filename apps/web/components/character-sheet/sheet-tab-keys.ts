/**
 * The character sheet's tab keys, in display order. A neutral (non-client)
 * module so any server consumer and the client {@link SheetTabs} share one
 * source — a runtime value exported from a `"use client"` module would reach
 * the server as a client reference, not the array.
 */
export const SHEET_TAB_KEYS = [
  "combat",
  "explore",
  "inventory",
  "archetypes",
] as const

export type SheetTabKey = (typeof SHEET_TAB_KEYS)[number]
