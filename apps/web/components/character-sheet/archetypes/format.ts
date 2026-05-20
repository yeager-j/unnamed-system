import type { Affinity, AffinityDamageType } from "@/lib/game/affinity"
import type { AttributeKey, Mastery } from "@/lib/game/archetypes/schema"

/** Short Attribute labels for the per-Archetype mini-grid (`St`, `Ma`, …). */
export const ATTRIBUTE_SHORT_LABELS: Record<AttributeKey, string> = {
  strength: "St",
  magic: "Ma",
  agility: "Ag",
  luck: "Lu",
}

/** Full Attribute names used in Mastery description sentences. */
export const ATTRIBUTE_FULL_LABELS: Record<AttributeKey, string> = {
  strength: "Strength",
  magic: "Magic",
  agility: "Agility",
  luck: "Luck",
}

/** Affinity word labels (Neutral intentionally absent — never charted). */
export const AFFINITY_LABELS: Record<Exclude<Affinity, "neutral">, string> = {
  weak: "Weak",
  resist: "Resist",
  null: "Null",
  repel: "Repel",
  drain: "Drain",
}

/** Damage-type column labels for the simplified affinity chips. */
export const DAMAGE_TYPE_LABELS: Record<AffinityDamageType, string> = {
  slash: "Slash",
  pierce: "Pierce",
  strike: "Strike",
  fire: "Fire",
  ice: "Ice",
  wind: "Wind",
  elec: "Elec",
  aether: "Aether",
  psy: "Psy",
  light: "Light",
  dark: "Dark",
}

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
  return `${signedAmount} ${ATTRIBUTE_FULL_LABELS[mastery.attribute]}`
}
