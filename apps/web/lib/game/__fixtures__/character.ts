import {
  deriveHydratedCharacter,
  type RawCharacterInputs,
} from "../character/derive-hydrated-character"
import type { HydratedCharacter } from "../character/hydrated-character"
import type {
  CharacterArchetypeRow,
  CharacterChainRow,
  CharacterKnifeRow,
  CharacterRow,
  InventoryItemRow,
} from "../character/records"
import type { StatComputationCharacter } from "../character/stats/stats"

/**
 * Shared, test-only builders for the character-engine input shapes. These let a
 * slice test assert *behavior* against synthetic inputs instead of importing
 * real catalog data and asserting balance numbers — so a rebalance never breaks
 * a logic test, and edge combinations the catalog can't currently express
 * (e.g. an Archetype carrying an arbitrary mechanic state) are reachable.
 *
 * Every builder takes shallow overrides and is cloned per call. See the
 * mutation-hardening rubric in `README.md`.
 */

export const FIXTURE_CHARACTER_ID = "fixture-char"

/**
 * A minimal-but-valid finalized {@link CharacterRow} — Level 1, balanced path,
 * no archetype, empty pools/logs. Override only the fields a test cares about.
 */
function makeCharacterRow(overrides: Partial<CharacterRow> = {}): CharacterRow {
  return {
    id: FIXTURE_CHARACTER_ID,
    shortId: "fixture-char-short",
    ownerId: "fixture-user",
    campaignId: null,
    status: "finalized",
    builderStep: 0,
    name: "Fixture Character",
    pronouns: "they/them",
    portraitUrl: null,
    level: 1,
    pathChoice: "balanced",
    currentHP: 20,
    currentSP: 20,
    hitDiceRemaining: 0,
    skillDiceRemaining: 0,
    manualBonuses: {},
    virtueExpression: 0,
    virtueEmpathy: 0,
    virtueWisdom: 0,
    virtueFocus: 0,
    sparkLog: [],
    victories: 0,
    currency: 100,
    prismaCharges: 2,
    prismaMaxCharges: 2,
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
    partyComposition: null,
    activeArchetypeId: null,
    originCharacterArchetypeId: null,
    savedArchetypeRanks: 0,
    ancestryText: null,
    backgroundText: null,
    backstoryText: null,
    personalityTraits: null,
    hopes: null,
    dreams: null,
    fears: null,
    secrets: null,
    gainedTalents: [],
    notes: null,
    identityVersion: 0,
    vitalsVersion: 0,
    inventoryVersion: 0,
    progressionVersion: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }
}

/** A `characterArchetype` row, defaulting to an unranked Warrior with no
 *  mechanic state. Pass `mechanicState` to seed a mechanic mid-state. */
export function makeArchetypeRow(
  overrides: Partial<CharacterArchetypeRow> = {}
): CharacterArchetypeRow {
  return {
    id: "fixture-arch",
    characterId: FIXTURE_CHARACTER_ID,
    archetypeKey: "warrior",
    rank: 1,
    inheritanceSlots: [],
    mechanicState: null,
    ...overrides,
  }
}

/**
 * The raw inputs {@link import("../character/derive-hydrated-character").deriveHydratedCharacter}
 * and the slice reducers consume. `row` merges shallowly over the default;
 * the row-collection fields default to empty so a test states only what it needs.
 */
export function makeRawCharacterInputs(
  overrides: {
    row?: Partial<CharacterRow>
    archetypeRows?: CharacterArchetypeRow[]
    inventoryRows?: InventoryItemRow[]
    knives?: CharacterKnifeRow[]
    chains?: CharacterChainRow[]
  } = {}
): RawCharacterInputs {
  return {
    row: makeCharacterRow(overrides.row),
    archetypeRows: overrides.archetypeRows ?? [],
    inventoryRows: overrides.inventoryRows ?? [],
    knives: overrides.knives ?? [],
    chains: overrides.chains ?? [],
  }
}

/**
 * The persistence-agnostic stat-computation view, defaulting to a Rank-5
 * Warrior with no equipment, skills, or mechanic. Generalizes the inline
 * `makeWarrior`/`makeMage` helpers the combat tests grew.
 */
export function makeStatComputationCharacter(
  overrides: Partial<StatComputationCharacter> = {}
): StatComputationCharacter {
  return {
    pathChoice: "balanced",
    level: 1,
    manualBonuses: {},
    activeArchetypeKey: "warrior",
    archetypes: [{ key: "warrior", rank: 5 }],
    equippedItems: [],
    activeSkills: [],
    activeMechanic: null,
    ...overrides,
  }
}

/**
 * A fully derived {@link HydratedCharacter} for tests that consume one directly
 * (the Archetypes display builders, command palette, …). Builds the raw inputs
 * with {@link makeRawCharacterInputs} and runs them through the real
 * {@link deriveHydratedCharacter}, so the derived fields are honest rather than
 * hand-stubbed.
 */
export function makeHydratedCharacter(
  overrides: Parameters<typeof makeRawCharacterInputs>[0] = {}
): HydratedCharacter {
  return deriveHydratedCharacter(makeRawCharacterInputs(overrides))
}
