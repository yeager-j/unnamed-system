import type { Combatant, CombatSession, CombatSide } from "./session"

/**
 * Pure read-only views over a {@link CombatSession} — derived state the reducer
 * never stores. Selectors that depend on a combatant being Fallen take
 * `fallenIds` as an injected `Set<string>` of combatant ids: the encounter layer
 * can't compute Fallen for a PC on its own (its vitals live on the character row,
 * read via `isFallen`), so the impure shell resolves the set and passes it in.
 */

/** The opposing side. */
function otherSide(side: CombatSide): CombatSide {
  return side === "players" ? "enemies" : "players"
}

/**
 * The combatants who still have to act this round: those whose
 * `hasActedThisRound` is `false` and who are not Fallen. Order matches
 * `session.combatants`.
 */
export function pendingCombatants(
  session: CombatSession,
  fallenIds: Set<string>
): Combatant[] {
  return session.combatants.filter(
    (combatant) => !combatant.hasActedThisRound && !fallenIds.has(combatant.id)
  )
}

/**
 * The side the DM should draft from next — pure and **derived** (no `draftingSide`
 * is stored). The side that won initiative (`firstSide`) leads **every** round
 * (rulebook 3.2); within a round the sides alternate, the side with fewer combatants
 * acted goes next (ties → `firstSide`), and a side with no eligible combatants left
 * is skipped so the other finishes back-to-back. During the round-1 opening
 * advantage phase (UNN-303) the advantaged side drafts until it is exhausted, then
 * the other side begins normal alternation. `fallenIds` excludes Fallen combatants
 * from eligibility (they don't take turns until revived). When neither side has an
 * eligible combatant the round is over — the caller advances the round — and this
 * returns the lead side as a harmless default.
 */
export function nextDraftingSide(
  session: CombatSession,
  fallenIds: Set<string>
): CombatSide {
  const lead = session.firstSide ?? "players"

  const pending = pendingCombatants(session, fallenIds)
  const pendingOn = (side: CombatSide) =>
    pending.filter((c) => c.side === side).length
  const actedOn = (side: CombatSide) =>
    session.combatants.filter((c) => c.side === side && c.hasActedThisRound)
      .length

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
 * The ordered list of combatants the UI highlights as valid next picks: those on
 * {@link nextDraftingSide} who have not acted this round and are not Fallen. A pure
 * helper over {@link pendingCombatants}; order matches `session.combatants`.
 */
export function eligibleCombatants(
  session: CombatSession,
  fallenIds: Set<string>
): Combatant[] {
  const side = nextDraftingSide(session, fallenIds)
  return pendingCombatants(session, fallenIds).filter((c) => c.side === side)
}

/**
 * Whether the character is a PC combatant in this session. Drives the
 * live-encounter placement lock (UNN-328): a character that is a combatant in a
 * `live` encounter cannot be unplaced or moved, since that would revoke the DM's
 * mid-fight vitals access. Matches only `pc` refs by `characterId` — `enemy` /
 * `catalog-enemy` combatants carry no character id. (UNN-330 may later fold this
 * into a shared lifecycle-lock primitive; for now the placement write calls it
 * directly.)
 */
export function sessionIncludesPc(
  session: CombatSession,
  characterId: string
): boolean {
  return session.combatants.some(
    (combatant) =>
      combatant.ref.kind === "pc" && combatant.ref.characterId === characterId
  )
}

/**
 * The character ids of every PC combatant in this session. Powers the member
 * live-lock (UNN-330): a player can't be kicked / leave while one of their
 * placed characters is a combatant, found by intersecting this set with the
 * characters that player owns. `enemy` / `catalog-enemy` refs carry no character
 * id and are skipped.
 */
export function pcCombatantCharacterIds(session: CombatSession): string[] {
  return session.combatants.flatMap((combatant) =>
    combatant.ref.kind === "pc" ? [combatant.ref.characterId] : []
  )
}
