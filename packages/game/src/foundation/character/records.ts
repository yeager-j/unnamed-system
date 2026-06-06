import type {
  Ailments,
  BattleConditions,
  InheritanceSlots,
  ManualBonuses,
  PartyComposition,
  PathChoice,
  SparkLog,
} from "@workspace/game/foundation/character/state"
import type { TalentKey } from "@workspace/game/foundation/character/talents/registry"
import { type MechanicState } from "@workspace/game/foundation/mechanics/schema"

/**
 * The persisted-character contract — the shape the pure derivation layer reads
 * and the `characters` table stores. Owned **here** (the game domain) rather
 * than inferred from the Drizzle table, so the engine never depends on the
 * persistence layer: `lib/db/schema` imports these and a compile-time assert
 * proves `typeof <table>.$inferSelect` conforms, so the two can't drift. See
 * `docs/engine-reorg`.
 */

/**
 * A character is either a `draft` (under construction in the wizard, hidden from
 * the public sheet) or `finalized` (a normal, shareable character).
 */
export type CharacterStatus = "draft" | "finalized"

/**
 * One `characters` row. Denormalized: in-session and progression state plus the
 * structured JSON bits (manual bonuses, Spark log, Ailments, Battle Conditions,
 * identity lists). Computed values (displayed Attributes, Affinity chart, max
 * HP/SP) are never stored — {@link import("./hydrated-character").HydratedCharacter}
 * derives them from this record plus hardcoded game data.
 */
export interface CharacterRow {
  id: string
  shortId: string
  ownerId: string
  campaignId: string | null
  status: CharacterStatus
  builderStep: number
  name: string
  pronouns: string | null
  portraitUrl: string | null
  level: number
  pathChoice: PathChoice
  currentHP: number
  currentSP: number
  hitDiceRemaining: number
  skillDiceRemaining: number
  manualBonuses: ManualBonuses
  virtueExpression: number
  virtueEmpathy: number
  virtueWisdom: number
  virtueFocus: number
  sparkLog: SparkLog
  victories: number
  currency: number
  prismaCharges: number
  prismaMaxCharges: number
  exhaustion: number
  ailments: Ailments
  battleConditions: BattleConditions | null
  partyComposition: PartyComposition | null
  activeArchetypeId: string | null
  originCharacterArchetypeId: string | null
  savedArchetypeRanks: number
  ancestryText: string | null
  backgroundText: string | null
  backstoryText: string | null
  personalityTraits: string | null
  hopes: string | null
  dreams: string | null
  fears: string | null
  secrets: string | null
  gainedTalents: TalentKey[]
  notes: string | null
  identityVersion: number
  vitalsVersion: number
  inventoryVersion: number
  progressionVersion: number
  createdAt: Date
  updatedAt: Date
}

/** One `characterArchetype` row — an Archetype a character has unlocked. */
export interface CharacterArchetypeRow {
  id: string
  characterId: string
  archetypeKey: string
  rank: number
  inheritanceSlots: InheritanceSlots
  mechanicState: MechanicState | null
}

/** One `inventoryItem` row — a catalog item reference plus equip/stack state. */
export interface InventoryItemRow {
  id: string
  characterId: string
  catalogItemKey: string
  equipped: boolean
  quantity: number
}

/** One `characterKnife` row — a titled "knife" identity beat (rulebook 1.5). */
export interface CharacterKnifeRow {
  id: string
  characterId: string
  title: string
  description: string | null
  order: number
}

/** One `characterChain` row — a titled "chain" identity beat (rulebook 1.5). */
export interface CharacterChainRow {
  id: string
  characterId: string
  title: string
  description: string | null
  order: number
}
