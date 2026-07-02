import {
  actionAvailability,
  fallenParticipantIds,
  participantDisplayNames,
  type Counters,
  type ParticipantView,
  type ResolvedSession,
  type Session,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"
import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import type { MapInstanceState } from "@workspace/game-v2/spatial"
import { zoneOf } from "@workspace/game-v2/spatial/selectors"

import type { ParticipantMeta } from "@/app/combat/[shortId]/encounter-access"

/**
 * The display projection the combatant **rail** renders — the v2 successor of
 * v1's `engine/encounter/roster-view.ts`, folding over the {@link
 * ResolvedSession} so a PC and an enemy read their pools/portrait through the
 * exact same resolved read-units (no injected PC map, no `ref.kind` branch).
 * The one storage read left is `isPc` — the participant's storage *home*
 * (durable = a character row backs it), projected once at the loader boundary
 * into {@link ParticipantMeta} and consumed resolved here — it drives the
 * portrait-vs-initials token and the "manages their own HP" copy, never a
 * mechanics branch.
 */

/** A current/max pool, the shape both vitals bars render. */
export interface Pool {
  current: number
  max: number
}

/** One participant as a rail row. `sp` is `null` when the entity resolves no
 *  SkillPool read-unit (enemies without SP). */
export interface RailRow {
  id: ParticipantId
  name: string
  side: CombatSide
  isPc: boolean
  isCurrent: boolean
  hasActed: boolean
  isFallen: boolean
  isDowned: boolean
  hp: Pool
  sp: Pool | null
  portraitUrl: string | null
  engagement: Engagement
  /** The participant's zone *display name*, or `null` when unplaced/unzoned. */
  zoneName: string | null
  reactionAvailable: boolean
  counters: Counters
}

/** The grouped rail: participants split by side (session order preserved),
 *  plus the enemies-group "N/M Downed" rollup counts. */
export interface RosterView {
  players: RailRow[]
  enemies: RailRow[]
  enemyCount: number
  downedEnemyCount: number
}

/** The resolved HP pool off a participant view, `{0,0}` when the entity
 *  resolves no Vitals read-unit (the rail's defensive default). */
export function hpPool(participantView: ParticipantView): Pool {
  const vitals = participantView.components.vitals
  return vitals
    ? { current: vitals.currentHP, max: vitals.maxHP }
    : { current: 0, max: 0 }
}

/** The resolved SP pool, or `null` when the entity carries no SkillPool. */
export function spPool(participantView: ParticipantView): Pool | null {
  const skillPool = participantView.components.skillPool
  return skillPool
    ? { current: skillPool.currentSP, max: skillPool.maxSP }
    : null
}

/** Builds the {@link RosterView} for one (optimistic) frame. */
export function buildRosterView(
  session: Session,
  view: ResolvedSession,
  instanceState: MapInstanceState,
  participantMeta: Record<ParticipantId, ParticipantMeta>
): RosterView {
  const fallenIds = fallenParticipantIds(view)
  const nameById = participantDisplayNames(view)

  const rows = session.participants.flatMap((participant) => {
    const participantView = view.get(participant.id)
    if (participantView === undefined) return []
    const zoneId = zoneOf(instanceState, participant.id)
    return [
      {
        id: participant.id,
        name: nameById.get(participant.id) ?? participant.id,
        side: participant.overlay.allegiance.side,
        isPc: participantMeta[participant.id]?.storage === "durable",
        isCurrent: participant.id === session.currentActorId,
        hasActed: participant.overlay.turnState.turnsTakenThisRound > 0,
        isFallen: fallenIds.has(participant.id),
        isDowned: participant.overlay.ailments.includes("downed"),
        hp: hpPool(participantView),
        sp: spPool(participantView),
        portraitUrl:
          participantView.components.presentation?.portraitUrl ?? null,
        engagement: participantView.components.engagement ?? {
          status: "free",
        },
        zoneName:
          zoneId !== undefined
            ? (instanceState.geometry.zones[zoneId]?.name ?? null)
            : null,
        reactionAvailable:
          actionAvailability(participant.overlay.turnState).reaction > 0,
        counters: participant.overlay.counters,
      } satisfies RailRow,
    ]
  })

  const enemies = rows.filter((row) => row.side === "enemies")
  return {
    players: rows.filter((row) => row.side === "players"),
    enemies,
    enemyCount: enemies.length,
    downedEnemyCount: enemies.filter((row) => row.isDowned).length,
  }
}
