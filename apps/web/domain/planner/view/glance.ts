import { VIRTUE_KEYS, type VirtueKey } from "@workspace/game-v2/kernel/vocab"
import type { TalentRoster } from "@workspace/game-v2/talents"
import {
  MAX_VIRTUE_RANK,
  SPARK_LOG_CAPACITY,
  type Virtues,
} from "@workspace/game-v2/virtues"

import { VIRTUE_LABELS } from "../../labels"

/**
 * The downtime workspace's **character glance** (UNN-576, handoff
 * "Downtime resolution workspace"): the resolved state the DM wants at hand
 * while adjudicating an activity — Sparks toward the next Virtue, the four
 * Virtue ranks, and the Talent roster. Pure over resolved components; the
 * batch read (`lib/db/queries/load-roster-glance.ts`) resolves entities and
 * folds each through this.
 */

export interface GlanceVirtue {
  key: VirtueKey
  label: string
  rank: number
  max: number
}

export interface RosterGlanceView {
  sparks: { current: number; capacity: number }
  virtues: GlanceVirtue[]
  /** Talent display labels, in the roster's render order. */
  talents: string[]
}

export function buildRosterGlance(input: {
  virtues: Virtues | undefined
  talentRoster: TalentRoster
}): RosterGlanceView {
  return {
    sparks: {
      current: input.virtues?.sparkLog.length ?? 0,
      capacity: SPARK_LOG_CAPACITY,
    },
    virtues: VIRTUE_KEYS.map((key) => ({
      key,
      label: VIRTUE_LABELS[key],
      rank: input.virtues?.ranks[key] ?? 0,
      max: MAX_VIRTUE_RANK,
    })),
    talents: input.talentRoster.entries.map((entry) => entry.label),
  }
}
