import type { ArchetypeTier, Lineage } from "@/lib/game/archetypes/schema"

/**
 * Display labels for every Lineage. The Archetypes tab groups unlocked
 * Archetypes by Lineage; this mapping lives alongside the components rather
 * than in game-data so the label phrasing is a UI concern, not a rules concern.
 */
export const LINEAGE_LABELS: Record<Lineage, string> = {
  warrior: "Warrior Lineage",
  mage: "Mage Lineage",
  brawler: "Brawler Lineage",
  knight: "Knight Lineage",
  healer: "Healer Lineage",
  thief: "Thief Lineage",
  berserker: "Berserker Lineage",
  bard: "Bard Lineage",
  shapechanger: "Shapechanger Lineage",
  hunter: "Hunter Lineage",
  warlock: "Warlock Lineage",
  summoner: "Summoner Lineage",
}

/** Display labels for the four Tiers. */
export const TIER_LABELS: Record<ArchetypeTier, string> = {
  initiate: "Initiate",
  adept: "Adept",
  elite: "Elite",
  paragon: "Paragon",
}
