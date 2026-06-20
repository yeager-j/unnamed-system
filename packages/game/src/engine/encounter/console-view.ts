import { type Statblock } from "@workspace/game/engine/combatant/statblock"
import { fallenCombatantIds } from "@workspace/game/engine/encounter/fallen"
import {
  eligibleCombatants,
  nextDraftingSide,
} from "@workspace/game/engine/encounter/selectors"
import type {
  Combatant,
  CombatSession,
  CombatSide,
} from "@workspace/game/foundation/encounter/session"

/**
 * The display projection the live DM console (UNN-344) renders the turn-order
 * spine from. A pure view over a {@link CombatSession} — the same "shape the
 * data next to the data, not in the component" rule the character sheet's
 * `resolve-*` helpers follow. The console passes the current (optimistic)
 * session plus the PC name/HP map its server page loaded; everything the strip
 * and header show is derived here.
 *
 * **Only Fallen are excluded from drafting** (rulebook 3.2 — "Fallen combatants
 * do not take turns until revived"; the injected `fallenCombatantIds` set is
 * exactly what the selectors take). A **Downed** combatant stays draft-eligible
 * on purpose: the rules have it "recover at the start of its turn" and
 * {@link import("./reduce/draft").reduceDraftCombatantEvent} clears Downed
 * precisely on draft, so excluding it would make recovery unreachable and freeze
 * it permanently. The combatant rail surfaces the Downed badge; the turn strip
 * treats a Downed combatant as an ordinary candidate.
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

/**
 * Resolves a combatant's display name from its {@link Combatant.ref}: a `pc`
 * defers to the injected `pcInfoById` (its name lives on the character row, not
 * the session); an `enemy` carries its name inline; a `catalog-enemy` resolves
 * through the hardcoded {@link getEnemy} catalog. Falls back to the raw id /
 * key when a lookup misses so the strip never renders blank.
 */
export function combatantName(
  combatant: Combatant,
  pcInfoById: Record<string, PcInfo>,
  enemyStatblockById: Record<string, Statblock>
): string {
  const ref = combatant.ref
  switch (ref.kind) {
    case "pc":
      return pcInfoById[ref.characterId]?.name ?? ref.characterId
    case "enemy":
      return ref.statBlock.name
    case "catalog-enemy":
      return enemyStatblockById[ref.enemyKey]?.name ?? ref.enemyKey
  }
}

/**
 * Appends an order-derived ordinal to repeated base names so duplicate combatants
 * read distinctly: a name that appears once stays bare, and later repeats become
 * "Bandit 2", "Bandit 3" (UNN-346's "numbered combatants" rule). Index-aligned to
 * the input. The single home of that format — shared by the pre-combat setup
 * roster ({@link import("./setup-roster-view").buildSetupCombatantLabels}) and the
 * live console's {@link combatantDisplayNames} — so the two views of the same
 * combatant can't drift on whether (and how) a duplicate is numbered.
 */
export function appendOrdinals(baseNames: string[]): string[] {
  const seen = new Map<string, number>()
  return baseNames.map((name) => {
    const ordinal = (seen.get(name) ?? 0) + 1
    seen.set(name, ordinal)
    return ordinal === 1 ? name : `${name} ${ordinal}`
  })
}

/**
 * The disambiguated display name of every combatant in a live session, keyed by
 * combatant id: each combatant's base {@link combatantName}, then
 * {@link appendOrdinals} over the **session-order** list so duplicate enemies read
 * "Bandit", "Bandit 2", "Bandit 3" — the same rule the pre-combat setup roster
 * applies, so a combatant keeps its number from setup into the fight. Every live
 * surface (the DM rail / drawer / battlefield and the redacted player snapshots)
 * resolves names through this instead of calling {@link combatantName} per
 * combatant, so they all number consistently.
 */
export function combatantDisplayNames(
  session: CombatSession,
  pcInfoById: Record<string, PcInfo>,
  enemyStatblockById: Record<string, Statblock>
): Map<string, string> {
  const labels = appendOrdinals(
    session.combatants.map((combatant) =>
      combatantName(combatant, pcInfoById, enemyStatblockById)
    )
  )
  return new Map(
    session.combatants.map((combatant, index) => [combatant.id, labels[index]!])
  )
}

/**
 * Builds the {@link ConsoleView} for the live console: resolves every
 * combatant's name and turn flags, the current actor, the side that drafts next,
 * and whether the round is exhausted. Pure — recomputed on every (optimistic)
 * session change, so a revive or a draft is reflected with no extra state.
 */
export function buildConsoleView(
  session: CombatSession,
  pcInfoById: Record<string, PcInfo>,
  enemyStatblockById: Record<string, Statblock>
): ConsoleView {
  const pcCurrentHpById = Object.fromEntries(
    Object.entries(pcInfoById).map(([id, info]) => [id, info.currentHP])
  )

  const fallenIds = fallenCombatantIds(
    session,
    pcCurrentHpById,
    enemyStatblockById
  )

  const eligibleIds = new Set(
    eligibleCombatants(session, fallenIds).map((c) => c.id)
  )

  const nameById = combatantDisplayNames(
    session,
    pcInfoById,
    enemyStatblockById
  )

  const rows: CombatantView[] = session.combatants.map((combatant) => ({
    id: combatant.id,
    name: nameById.get(combatant.id) ?? combatant.id,
    side: combatant.side,
    hasActed: combatant.hasActedThisRound,
    isCurrent: combatant.id === session.currentActorId,
    isFallen: fallenIds.has(combatant.id),
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
          name: nameById.get(actor.id) ?? actor.id,
          side: actor.side,
          hasActed: actor.hasActedThisRound,
        }
      : null,
    draftingSide: nextDraftingSide(session, fallenIds),
    roundComplete: eligibleIds.size === 0,
  }
}
