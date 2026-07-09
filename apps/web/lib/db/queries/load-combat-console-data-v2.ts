import { inArray } from "drizzle-orm"

import { getArchetype } from "@workspace/game-v2/catalog/archetypes"
import {
  derivePartyCompositionBySide,
  type Session,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial"

import type { ParticipantMeta } from "@/app/combat/[shortId]/encounter-access"
import type { CombatantSheetSlice } from "@/lib/combat/view/detail-view"
import { db } from "@/lib/db/client"
import { entity } from "@/lib/db/schema/entity"
import { resolveEntity, resolveSession } from "@/lib/game-engine-v2"

/**
 * The per-character-sheet drawer slice (UNN-538): active Archetype display name,
 * app-column pronouns, and Skills hydrated with the encounter's party composition.
 * The loader is the one sanctioned storage boundary: it decides which participants
 * have a sheet, then emits only the content the drawer needs.
 */
export async function loadCombatConsoleDataV2(
  session: Session,
  instance: MapInstanceState,
  participantMeta: Record<ParticipantId, ParticipantMeta>
): Promise<Record<ParticipantId, CombatantSheetSlice>> {
  const partyCompositionBySide = derivePartyCompositionBySide(
    resolveSession(session, instance)
  )
  const sheetParticipants = session.participants.flatMap((participant) => {
    const meta = participantMeta[participant.id]
    if (meta?.storage !== "durable") return []
    const activeKey = participant.entity.components.archetypes?.active
    return [
      {
        participantId: participant.id,
        entityId: meta.characterId,
        className: activeKey ? (getArchetype(activeKey)?.name ?? null) : null,
        skills:
          resolveEntity(participant.entity, {
            partyComposition:
              partyCompositionBySide[participant.overlay.allegiance.side],
          }).components.skills ?? [],
      },
    ]
  })
  if (sheetParticipants.length === 0) return {}

  const pronounsRows = await db
    .select({ id: entity.id, pronouns: entity.pronouns })
    .from(entity)
    .where(
      inArray(entity.id, [
        ...new Set(
          sheetParticipants.map((participant) => participant.entityId)
        ),
      ])
    )
  const pronounsById = new Map(
    pronounsRows.map((row) => [row.id, row.pronouns])
  )

  return Object.fromEntries(
    sheetParticipants.map((participant) => [
      participant.participantId,
      {
        className: participant.className,
        pronouns: pronounsById.get(participant.entityId) ?? null,
        skills: participant.skills,
      } satisfies CombatantSheetSlice,
    ])
  )
}
