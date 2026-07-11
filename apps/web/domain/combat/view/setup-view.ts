import {
  participantDisplayNames,
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
  engagementView,
  type EngageableTarget,
} from "@/domain/combat/view/detail-view"

/**
 * The encounter-setup roster's row model (UNN-535) — the per-tab data shaping
 * for `encounter-setup.tsx`, folded off the same optimistic frame the console
 * uses. `characterId` surfaces a durable participant's backing character (from
 * the loader-projected {@link ParticipantMeta}) so the Import-PCs toggle can
 * pair a placed character with its roster slot; `null` for inline enemies.
 */
export interface SetupRow {
  id: ParticipantId
  label: string
  side: CombatSide
  /** The occupied zone id, or `""` when unplaced (the row select's sentinel). */
  zoneId: string
  engagement: Engagement
  engagementOptions: EngageableTarget[]
  characterId: string | null
}

export function buildSetupRows(
  session: Session,
  view: ResolvedSession,
  instanceState: MapInstanceState,
  participantMeta: Record<ParticipantId, ParticipantMeta>
): SetupRow[] {
  const nameById = participantDisplayNames(view)

  return session.participants.map((participant) => {
    const meta = participantMeta[participant.id]
    const engagement = engagementView(
      session,
      instanceState,
      participant.id,
      nameById
    )
    return {
      id: participant.id,
      label: nameById.get(participant.id) ?? participant.id,
      side: participant.overlay.allegiance.side,
      zoneId: zoneOf(instanceState, participant.id) ?? "",
      engagement: engagement.value,
      engagementOptions: engagement.candidates,
      characterId: meta?.storage === "durable" ? meta.characterId : null,
    }
  })
}
