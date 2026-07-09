import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import { emptyNarrative } from "@workspace/game-v2/narrative"
import { ZERO_VIRTUE_ALLOCATION } from "@workspace/game-v2/virtues"

/**
 * The component keys a fresh draft is minted with — the always-present PC
 * skeleton (D37: stat capabilities carry a zeros/neutral/0 base; the real values
 * come from the Archetypes + Level/Path layers as the player builds).
 */
export type DraftComponents = Pick<
  ComponentRegistry,
  | "attributes"
  | "affinities"
  | "vitals"
  | "skillPool"
  | "resources"
  | "level"
  | "path"
  | "virtues"
  | "narrative"
>

/**
 * The component skeleton a builder draft is minted with (UNN-556). Everything
 * else — `archetypes`, `talents`, `mechanics`, `equipment`, `exhaustion`,
 * `skills`, `manualBonuses` — starts **absent** (NULL columns): the load seam
 * validates only present keys, `resolve` applies layers iff present, and the
 * creation Writers create their component from absent. Depletion-native zeros
 * mean the draft's pools derive at full by definition — finalize never writes
 * a pool value (CH3).
 */
export function draftEntityComponents(): DraftComponents {
  return {
    attributes: { base: { strength: 0, magic: 0, agility: 0, luck: 0 } },
    affinities: { base: {} },
    vitals: { base: 0, damage: 0 },
    skillPool: { base: 0, spSpent: 0 },
    resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 0 },
    level: { value: 1, victories: 0 },
    path: { choice: "balanced" },
    virtues: { ranks: ZERO_VIRTUE_ALLOCATION, sparkLog: [] },
    narrative: emptyNarrative(),
  }
}
