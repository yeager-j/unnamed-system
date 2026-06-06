import { DEFAULT_BATTLE_CONDITIONS } from "@workspace/game/foundation/character/state"
import {
  type Combatant,
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"

/**
 * Builds one fresh {@link Combatant} from a {@link CombatantSetup} and a minted
 * `id`: no ailments, all battle conditions neutral, every action (move/standard/
 * reaction) available, no active durations, and Free unless setup says otherwise.
 * `hasActedThisRound` is the
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
    zoneId: setup.zoneId,
    engagement: setup.engagement ?? { status: "free" },
    conditionDurations: {},
  }
}

/**
 * Projects a {@link Combatant} back down to the {@link CombatantSetup} it was
 * built from — the inverse of {@link makeCombatant}, keeping the
 * "which fields are setup-shaped" knowledge (side, identity, position,
 * engagement) in the engine rather than the UI. The setup shell uses it to seed
 * its editable roster from a persisted session (UNN-335); the rest of the
 * combatant overlay is the reducer's to own once combat is live.
 */
export function toCombatantSetup(combatant: Combatant): CombatantSetup {
  return {
    id: combatant.id,
    side: combatant.side,
    ref: combatant.ref,
    zoneId: combatant.zoneId,
    engagement: combatant.engagement,
  }
}

/**
 * Builds a valid initial {@link CombatSession} from encounter-setup inputs:
 * round 1, no current actor, no advantage declared yet (`advantage`/`firstSide`
 * are `null` until the `startCombat` event, UNN-303), and every combatant fresh
 * and not-yet-acted (see {@link makeCombatant}). A combatant's stable id is its
 * own `setup.id` when supplied (so a setup-authored roster keeps the same ids
 * across saves — UNN-301), falling back to `newId` otherwise (mirrors
 * `reduceCharacter`'s injectable id so tests can be deterministic).
 */
export function createCombatSession(
  setup: CombatantSetup[],
  newId: () => string = () => crypto.randomUUID()
): CombatSession {
  return {
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    combatants: setup.map((combatant) =>
      makeCombatant(combatant, combatant.id ?? newId(), false)
    ),
    zones: {},
    adjacency: {},
  }
}
