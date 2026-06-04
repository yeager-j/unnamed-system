import { getEnemy } from "@/lib/game/enemies"

import { fallenCombatantIds } from "./fallen"
import { eligibleCombatants, nextDraftingSide } from "./selectors"
import type { Combatant, CombatSession, CombatSide } from "./session"

/**
 * The display projection the live DM console (UNN-344) renders the turn-order
 * spine from. A pure view over a {@link CombatSession} — the same "shape the
 * data next to the data, not in the component" rule the character sheet's
 * `resolve-*` helpers follow. The console passes the current (optimistic)
 * session plus the PC name/HP map its server page loaded; everything the strip
 * and header show is derived here.
 *
 * **Why a `skipped` set wider than Fallen:** the turn selectors take a single
 * injected "exclude these" set. A **Downed** combatant is skipped exactly like a
 * Fallen one (rulebook 3.7 / UNN-305) — not a valid draft pick and not counted
 * among those still to act this round — but Downed lives on the combatant's
 * `ailments`, not its vitals, so {@link fallenCombatantIds} doesn't include it.
 * This module unions the two into `skippedCombatantIds` and feeds that to the
 * selectors, so eligibility and round-completion both honor "Fallen/Downed are
 * excluded" without widening the engine.
 */

/** The PC vitals the console's server page injects per `characterId`: enough to
 *  label a PC combatant and resolve its Fallen state. */
export interface PcInfo {
  name: string
  currentHP: number
}

/** One combatant as the turn-order strip renders it. `isEligible` is a valid
 *  *next* draft pick per {@link eligibleCombatants}; the strip only renders it as
 *  a tappable candidate while drafting. */
export interface CombatantView {
  id: string
  name: string
  side: CombatSide
  hasActed: boolean
  isCurrent: boolean
  isFallen: boolean
  isDowned: boolean
  isEligible: boolean
}

/** The current actor as the header renders it, or `null` before anyone is
 *  drafted / between rounds. `hasActed` distinguishes an active turn from the
 *  end-of-turn resolve beat. */
export interface CurrentActorView {
  id: string
  name: string
  side: CombatSide
  hasActed: boolean
}

export interface ConsoleView {
  rows: CombatantView[]
  currentActor: CurrentActorView | null
  draftingSide: CombatSide
  /** No combatant remains to draft this round — the caller offers "Start round
   *  N+1" (`advanceRound`). */
  roundComplete: boolean
}

/** Whether a combatant currently carries the Downed ailment. */
function isDowned(combatant: Combatant): boolean {
  return combatant.ailments.includes("downed")
}

/**
 * Resolves a combatant's display name from its {@link Combatant.ref}: a `pc`
 * defers to the injected `pcInfoById` (its name lives on the character row, not
 * the session); an `enemy` carries its name inline; a `catalog-enemy` resolves
 * through the hardcoded {@link getEnemy} catalog. Falls back to the raw id /
 * key when a lookup misses so the strip never renders blank.
 */
export function combatantName(
  combatant: Combatant,
  pcInfoById: Record<string, PcInfo>
): string {
  const ref = combatant.ref
  switch (ref.kind) {
    case "pc":
      return pcInfoById[ref.characterId]?.name ?? ref.characterId
    case "enemy":
      return ref.statBlock.name
    case "catalog-enemy":
      return getEnemy(ref.enemyKey)?.name ?? ref.enemyKey
  }
}

/**
 * Builds the {@link ConsoleView} for the live console: resolves every
 * combatant's name and turn flags, the current actor, the side that drafts next,
 * and whether the round is exhausted. Pure — recomputed on every (optimistic)
 * session change, so a revive or a draft is reflected with no extra state.
 */
export function buildConsoleView(
  session: CombatSession,
  pcInfoById: Record<string, PcInfo>
): ConsoleView {
  const pcCurrentHpById = Object.fromEntries(
    Object.entries(pcInfoById).map(([id, info]) => [id, info.currentHP])
  )

  const fallenIds = fallenCombatantIds(session, pcCurrentHpById)
  const skippedCombatantIds = new Set(fallenIds)
  for (const combatant of session.combatants) {
    if (isDowned(combatant)) skippedCombatantIds.add(combatant.id)
  }

  const eligibleIds = new Set(
    eligibleCombatants(session, skippedCombatantIds).map((c) => c.id)
  )

  const rows: CombatantView[] = session.combatants.map((combatant) => ({
    id: combatant.id,
    name: combatantName(combatant, pcInfoById),
    side: combatant.side,
    hasActed: combatant.hasActedThisRound,
    isCurrent: combatant.id === session.currentActorId,
    isFallen: fallenIds.has(combatant.id),
    isDowned: isDowned(combatant),
    isEligible: eligibleIds.has(combatant.id),
  }))

  const actor = session.combatants.find(
    (combatant) => combatant.id === session.currentActorId
  )

  return {
    rows,
    currentActor: actor
      ? {
          id: actor.id,
          name: combatantName(actor, pcInfoById),
          side: actor.side,
          hasActed: actor.hasActedThisRound,
        }
      : null,
    draftingSide: nextDraftingSide(session, skippedCombatantIds),
    roundComplete: eligibleIds.size === 0,
  }
}
