import { DEFAULT_BATTLE_CONDITIONS } from "@workspace/game/foundation/character/state"
import {
  type MapInstanceState,
  type MapToken,
} from "@workspace/game/foundation/encounter/map-instance"
import {
  type Combatant,
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"
import type { MapGeometry } from "@workspace/game/foundation/map/geometry"

/**
 * Builds one fresh {@link Combatant} from a {@link CombatantSetup} and a minted
 * `id`: the **non-spatial** combat state — no ailments, all battle conditions
 * neutral, every action (move/standard/reaction) available, no active durations,
 * no counters. Position and engagement are not on the combatant (M0 cutover,
 * UNN-459) — they ride the Instance occupancy token built by
 * {@link createMapInstance} from the same `setup`. `hasActedThisRound` is the
 * caller's call — `false` for combatants present at encounter start, `true` for a
 * mid-round joiner so it is queued for the next round (UNN-306). Shared by
 * {@link createCombatSession} and the `addCombatant` reducer slice so the
 * (long) field list lives in one place.
 */
export function makeCombatant(
  setup: CombatantSetup,
  id: string,
  hasActedThisRound: boolean
): Combatant {
  return {
    id,
    side: setup.side,
    ref: setup.ref,
    ailments: [],
    battleConditions: { ...DEFAULT_BATTLE_CONDITIONS },
    hasActedThisRound,
    moveAvailable: true,
    standardAvailable: true,
    reactionAvailable: true,
    conditionDurations: {},
    counters: {},
  }
}

/**
 * Projects a {@link Combatant} + its Instance occupancy `token` back down to the
 * {@link CombatantSetup} it was built from — the inverse of {@link makeCombatant}
 * paired with {@link createMapInstance}, keeping the "which fields are
 * setup-shaped" knowledge (side, identity, position, engagement) in the engine
 * rather than the UI. The setup shell uses it to seed its editable roster from a
 * persisted session + Instance (UNN-335); position/engagement come from the
 * `token` (the spatial state moved off the combatant — UNN-459), defaulting to
 * unplaced (`zoneId: ""`) and Free when the combatant has no token.
 */
export function toCombatantSetup(
  combatant: Combatant,
  token: MapToken | undefined
): CombatantSetup {
  return {
    id: combatant.id,
    side: combatant.side,
    ref: combatant.ref,
    zoneId: token?.zoneId ?? "",
    engagement: token?.engagement,
  }
}

/**
 * Builds a valid initial {@link CombatSession} from encounter-setup inputs:
 * round 1, no current actor, no advantage declared yet (`advantage`/`firstSide`
 * are `null` until the `startCombat` event, UNN-303), and every combatant fresh
 * and not-yet-acted (see {@link makeCombatant}). A combatant's stable id is its
 * own `setup.id` when supplied (so a setup-authored roster keeps the same ids
 * across saves — UNN-301), falling back to `newId` otherwise. `newId` is bound
 * at the composition root ({@link createGameEngine}) so the engine core carries
 * no default seam; tests inject a deterministic generator.
 */
export function createCombatSession(newId: () => string) {
  return (setup: CombatantSetup[]): CombatSession => ({
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    combatants: setup.map((combatant) =>
      makeCombatant(combatant, combatant.id ?? newId(), false)
    ),
  })
}

/**
 * Builds the {@link MapInstanceState} that co-mints with a {@link CombatSession}
 * from the same encounter-setup inputs: empty geometry (zones/connections authored
 * ad hoc via zone-graph events), no Enchantment, and an empty reveal overlay, with
 * one occupancy token per setup carrying its `zoneId` + `engagement` (Free unless
 * setup says otherwise) — the spatial state lifted off the combatant by the M0
 * cutover (UNN-459). A token is **keyed by the combatant's id**, resolved
 * exactly as {@link createCombatSession} resolves it (`setup.id ?? newId()`), so
 * occupancy and the session roster share the same ids; callers building both
 * from one setup list pass **stable setup ids** (the setup surface mints them
 * client-side — UNN-301/347) so the two halves agree. An empty `setup` yields a
 * blank Instance — the shape the encounter-create action mints before setup.
 *
 * A **dungeon** Instance instead snapshots an authored Map's geometry at
 * delve-start via {@link mapInstanceFromGeometry}.
 */
export function createMapInstance(newId: () => string) {
  return (setup: CombatantSetup[]): MapInstanceState => ({
    geometry: { zones: {}, connections: {} },
    occupancy: Object.fromEntries(
      setup.map((combatant) => [
        combatant.id ?? newId(),
        {
          zoneId: combatant.zoneId,
          engagement: combatant.engagement ?? { status: "free" },
        },
      ])
    ),
    enchantment: null,
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
  })
}

/**
 * Mints a fresh {@link MapInstanceState} from an authored Map's {@link MapGeometry}
 * — the **delve-start snapshot** (UNN-464 Decision 7). The Instance takes a copy
 * of the template geometry (so later My Maps edits never reach this run — snapshot
 * isolation) plus empty runtime: no occupancy, no Enchantment, nothing revealed
 * yet. PC tokens are placed in the same `delve-start` transaction; the
 * `move → reveal` rule then reveals Zones as the party explores. Unlike
 * {@link createMapInstance}, deps-free (no id minting — the geometry already
 * carries stable ids), so it is a plain function, not a curried factory.
 */
export function mapInstanceFromGeometry(
  geometry: MapGeometry
): MapInstanceState {
  return {
    geometry: structuredClone(geometry),
    occupancy: {},
    enchantment: null,
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
  }
}
