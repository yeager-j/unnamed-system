import type { BonusPool } from "@workspace/game-v2/kernel/bonus-pool"
import type { PathChoice } from "@workspace/game-v2/kernel/vocab"
import type { Level } from "@workspace/game-v2/progression/level.schema"
import type { Path } from "@workspace/game-v2/progression/path.schema"
import type { SkillPool } from "@workspace/game-v2/vitals/skill-pool.schema"
import type { Vitals } from "@workspace/game-v2/vitals/vitals.schema"

/**
 * The pure max-HP/SP derivation math, re-homed from v1
 * (`packages/game/src/engine/character/stats/stats.ts`). Small pure transforms
 * over explicit values — no catalog lookup, no I/O. `resolve` assembles the inputs
 * (the entity's `Vitals`/`SkillPool` base, the `Level`/`Path` progression layer,
 * the bonus pool) and composes these; the golden-master proves the numbers match
 * v1 exactly.
 */

/** Starting HP/SP and per-level gains by path (rulebook 1.1; averaged dice). */
export interface PathStats {
  startHP: number
  startSP: number
  hpPerLevel: number
  spPerLevel: number
}

/**
 * Per-path Hit Die and Skill Die sizes (rulebook 1.1). The app never rolls, but
 * display surfaces (the Rest dialog, the builder's path picker) show the die size.
 * The per-level HP/SP figures in {@link PathStats} are the averaged Hit Die /
 * two-Skill-Dice values these round-trip to — same table, no duplicated source.
 */
export interface PathDice {
  hitDie: 8 | 10 | 12
  skillDie: 8 | 10 | 12
}

/** The full published profile of a Path — stats + dice, one source of truth. */
interface PathProfile {
  stats: PathStats
  dice: PathDice
}

const PATH_STATS: Record<PathChoice, PathProfile> = {
  "health-focused": {
    stats: { startHP: 24, startSP: 40, hpPerLevel: 7, spPerLevel: 9 },
    dice: { hitDie: 12, skillDie: 8 },
  },
  balanced: {
    stats: { startHP: 20, startSP: 50, hpPerLevel: 6, spPerLevel: 11 },
    dice: { hitDie: 10, skillDie: 10 },
  },
  "skill-focused": {
    stats: { startHP: 16, startSP: 60, hpPerLevel: 5, spPerLevel: 13 },
    dice: { hitDie: 8, skillDie: 12 },
  },
}

/**
 * Path-stats lookup for display surfaces (the builder's HP/SP path picker, any
 * level-up walkthrough). The same {@link PATH_STATS} source the {@link computeMaxHP}
 * / {@link computeMaxSP} math reads, so a path's published numbers can't drift
 * between the engine and the UI.
 */
export function getPathStats(pathChoice: PathChoice): PathStats {
  return PATH_STATS[pathChoice].stats
}

/** Per-path Hit/Skill Die sizes, off the same {@link PATH_STATS} table. */
export function getPathDice(pathChoice: PathChoice): PathDice {
  return PATH_STATS[pathChoice].dice
}

/** Levels gained past the first — what the per-level HP/SP/dice gains scale by. */
function levelsGained(level: number): number {
  return Math.max(0, level - 1)
}

/** The Progression layer's HP contribution — path start + per-level gain × levels gained. */
function pathMaxHP(pathChoice: PathChoice, level: number): number {
  const path = PATH_STATS[pathChoice].stats
  return path.startHP + levelsGained(level) * path.hpPerLevel
}

/** The Progression layer's SP contribution — analogous to {@link pathMaxHP}. */
function pathMaxSP(pathChoice: PathChoice, level: number): number {
  const path = PATH_STATS[pathChoice].stats
  return path.startSP + levelsGained(level) * path.spPerLevel
}

/**
 * Effective **max HP** (D37): the entity's `Vitals.base` + the path/level layer
 * (only when it carries **both** `Level` and `Path` — i.e. a PC) + the HP bonus
 * pool. A PC's `base` is 0, so its maxHP is the path formula + bonuses; an enemy —
 * or a shapechanged entity (`applyForm` drops `Path`) — carries an authored `base`
 * and no path layer, but still gets the bonuses. The fold is uniform either way.
 *
 * Kept deliberately separate from {@link computeMaxSP} (no shared abstraction):
 * HP and SP share a shape today but are free to diverge.
 */
export function computeMaxHP(
  level: Level | undefined,
  path: Path | undefined,
  vitals: Pick<Vitals, "base">,
  pool: BonusPool
): number {
  const layer = level && path ? pathMaxHP(path.choice, level.value) : 0
  return Math.round(vitals.base + layer + pool.hp)
}

/** Effective **max SP** — the SP peer of {@link computeMaxHP}. */
export function computeMaxSP(
  level: Level | undefined,
  path: Path | undefined,
  skillPool: Pick<SkillPool, "base">,
  pool: BonusPool
): number {
  const layer = level && path ? pathMaxSP(path.choice, level.value) : 0
  return Math.round(skillPool.base + layer + pool.sp)
}
