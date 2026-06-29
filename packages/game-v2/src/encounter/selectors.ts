import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

import type { TurnState } from "./overlay"
import type { ParticipantView, ResolvedSession } from "./participant-view"
import type { Participant, Session } from "./session"

/**
 * Pure read-only views over a {@link Session} — derived state the reducer never
 * stores (CD9/CD10). The drafting selectors take `fallenIds` as an injected
 * `Set<ParticipantId>` (computed once by {@link
 * import("./fallen").fallenParticipantIds}) so the trio that call each other share
 * one Fallen computation rather than re-resolving per selector.
 *
 * The **acted-flag is derived**, never stored (CD10): a participant has acted iff
 * `overlay.turnState.turnsTakenThisRound > 0`. The name helpers read the resolved
 * `identity.name` **uniformly** — v1's per-kind `combatantName` switch is gone now
 * that the loader attaches `participant.entity`.
 */

/** The opposing side. */
function otherSide(side: CombatSide): CombatSide {
  return side === "players" ? "enemies" : "players"
}

/** Whether a participant has already taken a turn this round (the derived
 *  acted-flag — `turnsTakenThisRound > 0`, CD10). */
function hasActed(participant: Participant): boolean {
  return participant.overlay.turnState.turnsTakenThisRound > 0
}

/**
 * The participants who still have to act this round: those who have not acted and
 * are not Fallen. Order matches `session.participants`.
 */
export function pendingParticipants(
  session: Session,
  fallenIds: Set<ParticipantId>
): Participant[] {
  return session.participants.filter(
    (participant) => !hasActed(participant) && !fallenIds.has(participant.id)
  )
}

/**
 * The side the DM should draft from next — pure and **derived** (no `draftingSide`
 * is stored). The side that won initiative (`firstSide`) leads **every** round
 * (rulebook 3.2); within a round the sides alternate, the side with fewer
 * participants acted goes next (ties → `firstSide`), and a side with no eligible
 * participants left is skipped so the other finishes back-to-back. During the
 * round-1 opening advantage phase the advantaged side drafts until it is exhausted,
 * then the other side begins normal alternation. `fallenIds` excludes Fallen
 * participants from eligibility (they don't take turns until revived). When neither
 * side has an eligible participant the round is over — the caller advances the
 * round — and this returns the lead side as a harmless default.
 */
export function nextDraftingSide(
  session: Session,
  fallenIds: Set<ParticipantId>
): CombatSide {
  const lead = session.firstSide ?? "players"

  const pending = pendingParticipants(session, fallenIds)
  const pendingOn = (side: CombatSide) =>
    pending.filter((p) => p.overlay.allegiance.side === side).length
  const actedOn = (side: CombatSide) =>
    session.participants.filter(
      (p) => p.overlay.allegiance.side === side && hasActed(p)
    ).length

  const pendingPlayers = pendingOn("players")
  const pendingEnemies = pendingOn("enemies")

  if (pendingPlayers === 0 && pendingEnemies === 0) return lead
  if (pendingPlayers === 0) return "enemies"
  if (pendingEnemies === 0) return "players"

  if (
    session.round === 1 &&
    (session.advantage === "players" || session.advantage === "enemies")
  ) {
    return session.advantage
  }

  return actedOn(lead) <= actedOn(otherSide(lead)) ? lead : otherSide(lead)
}

/**
 * The ordered list of participants the UI highlights as valid next picks: those on
 * {@link nextDraftingSide} who have not acted this round and are not Fallen. A pure
 * helper over {@link pendingParticipants}; order matches `session.participants`.
 */
export function eligibleParticipants(
  session: Session,
  fallenIds: Set<ParticipantId>
): Participant[] {
  const side = nextDraftingSide(session, fallenIds)
  return pendingParticipants(session, fallenIds).filter(
    (p) => p.overlay.allegiance.side === side
  )
}

/** The remaining count of each per-turn action — the advisory action economy. */
export interface ActionAvailability {
  move: number
  standard: number
  reaction: number
}

/**
 * The advisory remaining-action counts for a participant, computed against the
 * constant **1/1/1** base budget under the v1-parity tracker (CD10) — `available =
 * 1 − used`, **floored at 0** because the action-economy reducer supports
 * multi-action (a signed-delta consumption can push `used` past 1; Tarantella,
 * Follow-Ups). The reducer never enforces a turn cap (R4.3 / R11) — this is a
 * read-only advisory. `turnsPerRound` stays the deferred boss multi-turn substrate
 * (not stored, not consumed here).
 */
export function actionAvailability(turnState: TurnState): ActionAvailability {
  return {
    move: Math.max(0, 1 - turnState.movesUsed),
    standard: Math.max(0, 1 - turnState.standardsUsed),
    reaction: Math.max(0, 1 - turnState.reactionsUsed),
  }
}

/**
 * A participant's base display name (NAME-1) — its resolved {@link
 * import("@workspace/game-v2/kernel/identity.schema").Identity} `name` from the
 * merged view, read **uniformly** (v1's per-kind `combatantName` switch is gone).
 * Falls back to the roster `id` when the entity resolves no Identity read-unit
 * (`?? id`, the nullish-absent case) — the roster id, not `participantView.id` (the
 * entity id).
 */
export function participantName(
  id: ParticipantId,
  participantView: ParticipantView
): string {
  return participantView.components.identity?.name ?? id
}

/**
 * Appends an order-derived ordinal to repeated base names so duplicate
 * participants read distinctly (NAME-2): a name that appears once stays bare, and
 * later repeats become "Bandit 2", "Bandit 3". Index-aligned to the input; each
 * base name counted independently; empty input ⇒ `[]`. The single home of that
 * format, so every live surface numbers duplicates consistently.
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
 * The disambiguated display name of every participant in a live session, keyed by
 * participant id (NAME-3): each participant's {@link participantName}, then {@link
 * appendOrdinals} over the **session-order** list so duplicate enemies read
 * "Bandit", "Bandit 2", "Bandit 3" while a lone PC stays bare. Order comes from the
 * {@link ResolvedSession} Map, which `resolveSession` builds in session order. The
 * single home all live surfaces route through, so numbering can't drift.
 */
export function participantDisplayNames(
  view: ResolvedSession
): Map<ParticipantId, string> {
  const entries = [...view]
  const labels = appendOrdinals(
    entries.map(([id, participantView]) => participantName(id, participantView))
  )
  return new Map(entries.map(([id], index) => [id, labels[index]!]))
}
