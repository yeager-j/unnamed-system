import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import {
  deriveHydratedCharacter,
  type RawCharacterInputs,
} from "@workspace/game/engine/character/derive-hydrated-character"
import {
  baseAffinitiesForArchetype,
  baseAttributesForArchetype,
  type StatContext,
} from "@workspace/game/engine/character/stats/stats"
import { type GameData } from "@workspace/game/engine/ports"
import { type CastContext } from "@workspace/game/engine/skills/utils"
import type { HydratedCharacter } from "@workspace/game/foundation/character/hydrated-character"
import type {
  CharacterArchetypeRow,
  CharacterChainRow,
  CharacterKnifeRow,
  CharacterRow,
  InventoryItemRow,
} from "@workspace/game/foundation/character/records"

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
 *
 * `data` resolves the Archetype the base Attributes/Affinities/Lineage derive
 * from. It defaults to an **empty** fixture catalog, so the default context has
 * zeroed base stats and a null Lineage — pass `gameData` (or a
 * {@link makeTestGameData} adapter) to derive against shipped or fixture
 * Archetypes. Keeping the lookup explicit means a behavior test can never
 * silently reach the real catalog through this helper.
 */
export function makeStatContext(
  overrides: Partial<StatContext> = {},
  data: GameData = makeTestGameData()
): StatContext {
  const activeArchetypeKey =
    overrides.activeArchetypeKey === undefined
      ? "warrior"
      : overrides.activeArchetypeKey
  const activeArchetype = activeArchetypeKey
    ? data.getArchetype(activeArchetypeKey)
    : undefined
  return {
    pathChoice: "balanced",
    level: 1,
    manualBonuses: {},
    activeArchetypeKey,
    activeLineage: activeArchetype?.lineage ?? null,
    archetypes: [
      {
        key: "warrior",
        rank: 5,
        mastery: data.getArchetype("warrior")?.mastery ?? {
          kind: "hp",
          amount: 20,
        },
      },
    ],
    equippedItems: [],
    activeSkills: [],
    activeMechanic: null,
    baseAttributes: baseAttributesForArchetype(activeArchetype),
    baseAffinities: baseAffinitiesForArchetype(activeArchetype),
    ...overrides,
  }
}

/**
 * The {@link makeStatContext} view plus the two live, tracked combat pools — the
 * cast-flow input. Defaults the pools high (100/100) so affordability is never
 * the constraint unless a test sets it; pass `currentHP`/`currentSP` to probe a
 * gate. Generalizes the inline `makeCharacter` the skill-cost tests grew.
 *
 * `data` is threaded into {@link makeStatContext} (same empty-catalog default —
 * pass `gameData` to opt into shipped balance).
 */
export function makeCastContext(
  overrides: Partial<CastContext> = {},
  data: GameData = makeTestGameData()
): CastContext {
  return {
    ...makeStatContext(overrides, data),
    currentHP: 100,
    currentSP: 100,
    ...overrides,
  }
}

/**
 * A fully derived {@link HydratedCharacter} for tests that consume one directly
 * (the Archetypes display builders, command palette, …). Builds the raw inputs
 * with {@link makeRawCharacterInputs} and runs them through the real
 * {@link deriveHydratedCharacter}, so the derived fields are honest rather than
 * hand-stubbed.
 *
 * `data` defaults to an **empty** fixture catalog, so a behavior test never
 * depends on shipped balance numbers by accident; pass a {@link makeTestGameData}
 * adapter to derive against fixture Archetypes/Skills, or `gameData` to derive
 * against the real catalog (a visible opt-in).
 */
export function makeHydratedCharacter(
  overrides: Parameters<typeof makeRawCharacterInputs>[0] = {},
  data: GameData = makeTestGameData()
): HydratedCharacter {
  return deriveHydratedCharacter(data)(makeRawCharacterInputs(overrides))
}
