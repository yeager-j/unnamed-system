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

import type { ParticipantMeta } from "@/domain/combat/participant-meta"
import {
  combatantAvatar,
  type CombatantAvatar,
} from "@/domain/combat/view/avatar"
import { displayHome } from "@/domain/combat/view/display-home"
import type { Pool } from "@/domain/combat/view/pool"
import { COMBATANT_DOWN_LABELS } from "@/domain/labels"

/**
 * The display projection the combatant **rail** renders — the v2 successor of
 * v1's `engine/encounter/roster-view.ts`, folding over the {@link
 * ResolvedSession} so a PC and an enemy read their pools/portrait through the
 * exact same resolved read-units (no injected PC map, no `ref.kind` branch).
 * The participant's storage *home* (durable = a character row backs it) is
 * projected once at the loader boundary into {@link ParticipantMeta} and
 * **dies at {@link displayHome}**: it resolves into the {@link
 * CombatantAvatar} variant and the Fallen/Dead `downLabel`, never a mechanics
 * branch — no storage boolean survives for the rail to re-branch on.
 */

/** One participant as a rail row. `hp`/`sp` are `null` when the entity
 *  resolves no such read-unit. */
export interface RailRow {
  id: ParticipantId
  name: string
  side: CombatSide
  avatar: CombatantAvatar
  isCurrent: boolean
  hasActed: boolean
  isFallen: boolean
  isDowned: boolean
  /** The Fallen/Dead badge copy, `null` while up. */
  downLabel: string | null
  hp: Pool | null
  sp: Pool | null
  /** The *uploaded* token art or `null` — raw material for the 20px canvas
   *  glyph, which falls back to initials rather than `avatar`'s gradient. */
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

/** The resolved HP pool, or `null` when the entity carries no Vitals —
 *  absence, not an empty `{0,0}` pool. */
export function hpPool(participantView: ParticipantView): Pool | null {
  const vitals = participantView.components.vitals
  return vitals ? { current: vitals.currentHP, max: vitals.maxHP } : null
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
    const name = nameById.get(participant.id) ?? participant.id
    const side = participant.overlay.allegiance.side
    const home = displayHome(participantMeta[participant.id])
    const isFallen = fallenIds.has(participant.id)
    const portraitUrl =
      participantView.components.presentation?.portraitUrl ?? null
    return [
      {
        id: participant.id,
        name,
        side,
        avatar: combatantAvatar({
          home,
          portraitUrl,
          name,
          id: participant.id,
          side,
        }),
        isCurrent: participant.id === session.currentActorId,
        hasActed: participant.overlay.turnState.turnsTakenThisRound > 0,
        isFallen,
        isDowned: participant.overlay.ailments.includes("downed"),
        downLabel: isFallen ? COMBATANT_DOWN_LABELS[home] : null,
        hp: hpPool(participantView),
        sp: spPool(participantView),
        portraitUrl,
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
