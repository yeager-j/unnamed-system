import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

import type { ParticipantView, ResolvedSession } from "./participant-view"

/**
 * Start-of-combat initiative (rulebook 3.2; CD9a). When combat opens **neutral**,
 * the side with the **highest Agility** leads every round; ties break on the
 * highest **Luck**, and a still-tie is the DM's d20 call. The app rolls no dice, so
 * this pure helper computes the deterministic part — each side's highest
 * Agility/Luck and the {@link InitiativeComparison.suggested} leader — and the DM
 * confirms or overrides it in the start-combat dialog. For an *ambush* the
 * advantaged side leads outright, so this is consulted only for a neutral opening.
 *
 * **The F1 kill (CD9a):** v1's three-arm `resolveStats` `CombatantRef` switch
 * evaporates. The loader (UNN-516) already dissolved storage into
 * `participant.entity`, so each side's stats come from each participant's resolved
 * `attributes` read-unit in the view **uniformly** — PC, enemy, and ex-catalog enemy
 * run the one read with zero `kind` branch.
 */

/** The two attributes initiative compares, per participant. */
export interface InitiativeStats {
  agility: number
  luck: number
}

/** A side's highest Agility and highest Luck (each over *all* its participants,
 *  independently — rulebook 3.2). `null` when the side has no participants. */
export interface SideInitiative {
  highestAgility: number | null
  highestLuck: number | null
}

export interface InitiativeComparison {
  players: SideInitiative
  enemies: SideInitiative
  /** The side to lead a neutral start, or `null` when the sides tie through Luck
   *  (the rulebook's DM-d20 case — the dialog leaves the pick to the DM). */
  suggested: CombatSide | null
}

/**
 * A participant's {@link InitiativeStats} from its resolved Attributes read-unit. A
 * view with no `attributes` read-unit (an entity carrying no Attributes capability —
 * never a combat-eligible combatant under parity) yields `null` and is ignored, the
 * v2 analogue of v1's "PC with no supplied stats / unknown catalog key" arm.
 */
function participantStats(
  participantView: ParticipantView
): InitiativeStats | null {
  const attributes = participantView.components.attributes
  if (attributes === undefined) return null
  return { agility: attributes.agility, luck: attributes.luck }
}

function sideInitiative(stats: InitiativeStats[]): SideInitiative {
  if (stats.length === 0) return { highestAgility: null, highestLuck: null }
  return {
    highestAgility: Math.max(...stats.map((s) => s.agility)),
    highestLuck: Math.max(...stats.map((s) => s.luck)),
  }
}

/** Agility, then Luck; an empty side yields to a non-empty one; a true tie is the
 *  DM's call (`null`). */
function suggestedSide(
  players: SideInitiative,
  enemies: SideInitiative
): CombatSide | null {
  const pa = players.highestAgility
  const ea = enemies.highestAgility
  if (pa === null && ea === null) return null
  if (ea === null) return "players"
  if (pa === null) return "enemies"
  if (pa > ea) return "players"
  if (ea > pa) return "enemies"

  // Agility tied → highest Luck (non-null whenever Agility is non-null).
  const pl = players.highestLuck!
  const el = enemies.highestLuck!
  if (pl > el) return "players"
  if (el > pl) return "enemies"
  return null
}

/**
 * Compares the two sides' opening initiative over the resolved-encounter view. Pure
 * — the dialog re-derives it whenever the roster changes. Each participant's side is
 * its **allegiance overlay** (`participantView.components.allegiance.side`, always
 * present in the merged view), so a charmed PC counts on the side it currently
 * fights for.
 */
export function compareInitiative(view: ResolvedSession): InitiativeComparison {
  const statsForSide = (side: CombatSide): InitiativeStats[] =>
    [...view.values()]
      .filter(
        (participantView) => participantView.components.allegiance.side === side
      )
      .map(participantStats)
      .filter((stats): stats is InitiativeStats => stats !== null)

  const players = sideInitiative(statsForSide("players"))
  const enemies = sideInitiative(statsForSide("enemies"))
  return { players, enemies, suggested: suggestedSide(players, enemies) }
}
