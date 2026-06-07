import { type Statblock } from "@workspace/game/engine/combatant/statblock"
import type {
  CombatantSetup,
  CombatSide,
} from "@workspace/game/foundation/encounter/session"

/**
 * Start-of-combat initiative (rulebook 3.2). When combat opens **neutral**, the
 * side with the **highest Agility** leads every round; ties break on the highest
 * **Luck**, and a still-tie is the DM's d20 call. The app rolls no dice, so this
 * pure helper computes the deterministic part — each side's highest Agility/Luck
 * and the {@link InitiativeComparison.suggested} leader — and the DM confirms or
 * overrides it in the start-combat dialog. For an *ambush* the advantaged side
 * leads outright, so this is consulted only for a neutral opening.
 */

/** The two attributes initiative compares, per combatant. */
export interface InitiativeStats {
  agility: number
  luck: number
}

/** A side's highest Agility and highest Luck (each over *all* its combatants,
 *  independently — rulebook 3.2). `null` when the side has no combatants. */
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
 * Resolves a combatant's {@link InitiativeStats}: a `pc` from the injected
 * `pcStatsById` (its attributes live on the character row), an inline `enemy`
 * from its stat block, a `catalog-enemy` from its hardcoded definition. `null`
 * when a PC's stats weren't supplied or a catalog key is unknown — that
 * combatant is then ignored.
 */
function resolveStats(
  combatant: CombatantSetup,
  pcStatsById: Record<string, InitiativeStats>,
  enemyStatblockById: Record<string, Statblock>
): InitiativeStats | null {
  const ref = combatant.ref
  if (ref.kind === "pc") return pcStatsById[ref.characterId] ?? null
  if (ref.kind === "enemy") {
    const { agility, luck } = ref.statBlock.attributes
    return { agility, luck }
  }
  const statblock = enemyStatblockById[ref.enemyKey]
  return statblock
    ? {
        agility: statblock.attributes.agility,
        luck: statblock.attributes.luck,
      }
    : null
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
  if (pa !== ea) return pa > ea ? "players" : "enemies"

  // Agility tied → highest Luck (non-null whenever Agility is non-null).
  const pl = players.highestLuck!
  const el = enemies.highestLuck!
  if (pl !== el) return pl > el ? "players" : "enemies"
  return null
}

/**
 * Compares the two sides' opening initiative from the setup roster. Pure — the
 * dialog re-derives it whenever the roster changes.
 */
export function compareInitiative(
  combatants: readonly CombatantSetup[],
  pcStatsById: Record<string, InitiativeStats>,
  enemyStatblockById: Record<string, Statblock>
): InitiativeComparison {
  const statsForSide = (side: CombatSide): InitiativeStats[] =>
    combatants
      .filter((combatant) => combatant.side === side)
      .map((combatant) =>
        resolveStats(combatant, pcStatsById, enemyStatblockById)
      )
      .filter((stats): stats is InitiativeStats => stats !== null)

  const players = sideInitiative(statsForSide("players"))
  const enemies = sideInitiative(statsForSide("enemies"))
  return { players, enemies, suggested: suggestedSide(players, enemies) }
}
