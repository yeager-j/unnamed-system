import {
  defaultOverlay,
  type OverlayComponents,
} from "@workspace/game-v2/encounter/overlay"
import type {
  ParticipantView,
  ParticipantViewComponents,
} from "@workspace/game-v2/encounter/participant-view"
import {
  DAMAGE_TYPES,
  type AffinityChart,
  type AttributeScores,
} from "@workspace/game-v2/kernel/vocab"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

import type { Viewer } from "../relationship"

/**
 * Compact builders for the redaction tests. A {@link ParticipantView} is `{ id,
 * components }` where the six overlay components are always present (the merged
 * view, CD14); {@link makeParticipantView} defaults them so a test states only the resolved
 * / instance read-units it cares about.
 */

/** A flat-`10` attribute block, per-attribute overridable. */
export function attributeScores(
  overrides: Partial<AttributeScores> = {}
): AttributeScores {
  return { strength: 10, magic: 10, agility: 10, luck: 10, ...overrides }
}

/** A fully-neutral Affinity chart (all 12 damage types), per-type overridable. */
export function affinityChart(
  overrides: Partial<AffinityChart> = {}
): AffinityChart {
  const neutral = Object.fromEntries(
    DAMAGE_TYPES.map((type) => [type, "neutral"])
  ) as AffinityChart
  return { ...neutral, ...overrides }
}

/**
 * A merged participant-view: the six overlay components defaulted from `side`, then the
 * given resolved / instance read-units spread on top (a later `components`
 * override of an overlay key wins, e.g. to swap allegiance).
 */
export function makeParticipantView(opts: {
  id: string
  side?: CombatSide
  components?: Partial<ParticipantViewComponents>
  overlay?: Partial<OverlayComponents>
}): ParticipantView {
  return {
    id: opts.id,
    components: {
      ...defaultOverlay({ side: opts.side ?? "players" }),
      ...opts.overlay,
      ...opts.components,
    },
  }
}

/** A signed-out watcher — spectator to everyone (no side, owns nothing). */
export function spectator(): Viewer {
  return { isDm: false, side: null, ownedEntityIds: new Set() }
}

/** The encounter DM — full visibility via the dm short-circuit. */
export function dm(): Viewer {
  return { isDm: true, side: null, ownedEntityIds: new Set() }
}

/**
 * A signed-in player on `side`, controlling `owned` entity ids. `side` decides
 * ally/opponent for entities the player does not own; `owned` makes those entities
 * read `own` regardless of side (the ownership capability).
 */
export function player(side: CombatSide, owned: string[] = []): Viewer {
  return { isDm: false, side, ownedEntityIds: new Set(owned) }
}
