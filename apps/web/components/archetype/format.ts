import { type Mastery } from "@workspace/game-v2/archetypes/archetype"

import { ATTRIBUTE_LABELS } from "@/domain/labels"

/** Signed Attribute modifier with a true Unicode minus: `+4`, `0`, `−3`. */
export function formatModifier(value: number): string {
  if (value > 0) return `+${value}`
  if (value < 0) return `−${Math.abs(value)}`
  return "0"
}

/** Talent-key slug → display label (`handle-animal` → `Handle Animal`). */
export function formatTalentLabel(talent: string): string {
  return talent
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

/**
 * Phrases an Archetype's Mastery bonus as a sentence fragment: `+20 HP`,
 * `+1 Strength`, etc. View-layer because the phrasing is presentational.
 */
export function formatMasteryDescription(mastery: Mastery): string {
  const signedAmount =
    mastery.amount >= 0 ? `+${mastery.amount}` : `−${Math.abs(mastery.amount)}`
  if (mastery.kind === "hp") return `${signedAmount} HP`
  if (mastery.kind === "sp") return `${signedAmount} SP`
  return `${signedAmount} ${ATTRIBUTE_LABELS[mastery.attribute]}`
}
