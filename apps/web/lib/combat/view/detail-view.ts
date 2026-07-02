import {
  actionAvailability,
  engagementCandidates,
  participantDisplayNames,
  type ActionAvailability,
  type Ailments,
  type BattleConditions,
  type ConditionDurations,
  type Counters,
  type ResolvedSession,
  type Session,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type {
  AffinityChart,
  AttributeScores,
} from "@workspace/game-v2/kernel/vocab"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"
import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import type { ResolvedSkill } from "@workspace/game-v2/skills/resolved"
import type { MapInstanceState, MapZone } from "@workspace/game-v2/spatial"
import { zoneOf } from "@workspace/game-v2/spatial/selectors"
import { isFallen } from "@workspace/game-v2/vitals/operations"
import type { HydratedSkill } from "@workspace/game/foundation"

import type { ParticipantMeta } from "@/app/combat/[shortId]/encounter-access"
import type { WriterDeps } from "@/lib/combat/commit/writers"
import { hpPool, spPool, type Pool } from "@/lib/combat/view/roster-view"
import { adjacentZones } from "@/lib/combat/view/zone-graph"

/**
 * The per-combatant **drawer model** — the v2 successor of v1's
 * `combatantDetail`. The read-only stat sections are shaped **by capability**:
 * `attributes`/`affinities`/`hp`/`sp` are each `null` exactly when the entity
 * resolves no such read-unit, and the drawer renders a section iff its datum
 * resolved — no `kind` branch decides what an "enemy" vs a "PC" shows.
 *
 * The one place the storage home surfaces is the {@link DurableDetail} slice
 * (`null` for an inline participant): the character-row identity + the
 * party-scaled v1-shaped Skill cards the hydration loader supplies — display
 * data that genuinely lives on the character row, plus the tokens the durable
 * write path guards on. An inline participant's skills come off the resolved
 * view instead ({@link CombatantDetail.resolvedSkills}).
 */

export interface EngageableTarget {
  id: ParticipantId
  label: string
}

/** The drawer's engagement readout + control feed: the raw value, current
 *  targets resolved to display names, and the candidates it may engage —
 *  v2's allegiance-gated same-zone set, **plus** any current targets so an
 *  existing engagement is always clearable after a move. */
export interface CombatantEngagementView {
  value: Engagement
  targetNames: string[]
  candidates: EngageableTarget[]
}

/** The move control's feed: the occupied zone (`null` when unplaced) and the
 *  zones it may move to — adjacent when placed, every zone when unplaced (the
 *  mid-combat joiner placement affordance). `null` when the encounter defines
 *  no zones at all. */
export interface CombatantPosition {
  current: MapZone | null
  targets: MapZone[]
}

/** The character-row slice a durable participant's drawer additionally shows. */
export interface DurableDetail {
  characterId: string
  vitalsVersion: number
  className: string | null
  pronouns: string | null
  /** Party-scaled v1-shaped Skill cards (the shared SkillRow's input),
   *  hydrated per durable participant by `load-combat-console-data-v2`. */
  skills: HydratedSkill[]
}

export interface CombatantDetail {
  id: ParticipantId
  name: string
  side: CombatSide
  /** Storage home projected to the display question the token/footer ask. */
  isPc: boolean
  level: number | null
  portraitUrl: string | null
  // editable overlay
  ailments: Ailments
  battleConditions: BattleConditions
  conditionDurations: ConditionDurations
  counters: Counters
  actionAvailability: ActionAvailability
  // spatial
  position: CombatantPosition | null
  engagement: CombatantEngagementView
  // vitals (null ⇔ the capability didn't resolve)
  hp: Pool | null
  sp: Pool | null
  isFallen: boolean
  // read-only stats (null/empty ⇔ the read-unit didn't resolve)
  attributes: AttributeScores | null
  affinities: AffinityChart | null
  resolvedSkills: ResolvedSkill[]
  talentKeys: string[]
  /** The resolved caps the Writers validate against — derived from the view
   *  model, never the wire. `maxPrisma` stays `undefined` until the v2 upgrade
   *  tree ships a resolvable cap, so no Prisma affordance renders anywhere. */
  deps: WriterDeps
  durable: DurableDetail | null
}

/** The loader-supplied per-durable-participant hydration the drawer folds in. */
export interface DurableHydration {
  className: string | null
  pronouns: string | null
  skills: HydratedSkill[]
}

/** Builds the drawer model for one participant, or `null` for an unknown id. */
export function combatantDetail(
  session: Session,
  view: ResolvedSession,
  instanceState: MapInstanceState,
  participantId: ParticipantId,
  meta: ParticipantMeta | undefined,
  hydration: DurableHydration | undefined
): CombatantDetail | null {
  const participant = session.participants.find((p) => p.id === participantId)
  const participantView = view.get(participantId)
  if (participant === undefined || participantView === undefined) return null

  const nameById = participantDisplayNames(view)
  const vitals = participantView.components.vitals
  const overlay = participant.overlay

  return {
    id: participantId,
    name: nameById.get(participantId) ?? participantId,
    side: overlay.allegiance.side,
    isPc: meta?.storage === "durable",
    level: participant.entity.components.level?.value ?? null,
    portraitUrl: participantView.components.presentation?.portraitUrl ?? null,
    ailments: overlay.ailments,
    battleConditions: overlay.battleConditions,
    conditionDurations: overlay.conditionDurations,
    counters: overlay.counters,
    actionAvailability: actionAvailability(overlay.turnState),
    position: combatantPosition(instanceState, participantId),
    engagement: engagementView(session, instanceState, participantId, nameById),
    hp: participantView.components.vitals ? hpPool(participantView) : null,
    sp: spPool(participantView),
    isFallen: vitals !== undefined && isFallen(vitals),
    attributes: participantView.components.attributes ?? null,
    affinities: participantView.components.affinities ?? null,
    resolvedSkills: participantView.components.skills ?? [],
    talentKeys: (participant.entity.components.talents ?? []).map(
      (talent) => talent.key
    ),
    deps: {},
    durable:
      meta?.storage === "durable"
        ? {
            characterId: meta.characterId,
            vitalsVersion: meta.vitalsVersion,
            className: hydration?.className ?? null,
            pronouns: hydration?.pronouns ?? null,
            skills: hydration?.skills ?? [],
          }
        : null,
  }
}

function combatantPosition(
  instanceState: MapInstanceState,
  participantId: ParticipantId
): CombatantPosition | null {
  const zones = instanceState.geometry.zones
  if (Object.keys(zones).length === 0) return null
  const zoneId = zoneOf(instanceState, participantId)
  const current = zoneId !== undefined ? (zones[zoneId] ?? null) : null
  const targets = current
    ? adjacentZones(instanceState.geometry, current.id)
    : Object.values(zones)
  return { current, targets }
}

/**
 * One participant's engagement readout + candidate set — shared by the drawer
 * detail and the setup roster rows, so staged and live engagement offer the
 * same targets. Reads the token directly off occupancy (the same value the
 * loader's read-bag projects).
 */
export function engagementView(
  session: Session,
  instanceState: MapInstanceState,
  participantId: ParticipantId,
  nameById: Map<ParticipantId, string>
): CombatantEngagementView {
  const value: Engagement = instanceState.occupancy[participantId]
    ?.engagement ?? { status: "free" }
  const currentTargets =
    value.status === "engaged" ? value.targetCombatantIds : []

  const candidateIds = new Set<ParticipantId>([
    ...engagementCandidates(session, instanceState, participantId),
    ...currentTargets,
  ])

  return {
    value,
    targetNames: currentTargets.map((id) => nameById.get(id) ?? id),
    candidates: [...candidateIds].map((id) => ({
      id,
      label: nameById.get(id) ?? id,
    })),
  }
}
