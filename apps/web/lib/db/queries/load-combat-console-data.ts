import { inArray } from "drizzle-orm"

import { getArchetype } from "@workspace/game-v2/catalog/archetypes"
import {
  derivePartyCompositionBySide,
  participantResolveContext,
  spatialReadsFor,
  type Session,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial"

import type { ParticipantMeta } from "@/domain/combat/participant-meta"
import type { CombatantSheetSlice } from "@/domain/combat/sheet-slice"
import { resolveEntity, resolveSession } from "@/domain/game-engine-v2"
import { db, type WriteExecutor } from "@/lib/db/client"
import { entity } from "@/lib/db/schema/entity"

/**
 * The per-character-sheet drawer slice (UNN-538): active Archetype display name,
 * app-column pronouns, and Skills hydrated with the encounter's party composition.
 * The loader is the one sanctioned storage boundary: it decides which participants
 * have a sheet, then emits only the content the drawer needs.
 *
 * The pronouns read is by **pinned entity id** off the live session, so it stays
 * `deletedAt`-blind (R1 — UNN-571): the live-encounter lock keeps a tombstone out
 * of a live fight, so there is nothing to filter, and dropping a pinned id would
 * blank a live combatant's drawer. See `schema/entity.ts` / `encounter-lock.ts`.
 */
export async function loadCombatConsoleData(
  session: Session,
  instance: MapInstanceState,
  participantMeta: Record<ParticipantId, ParticipantMeta>,
  executor: WriteExecutor = db
): Promise<Record<ParticipantId, CombatantSheetSlice>> {
  const spatialReads = spatialReadsFor(instance)
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
          resolveEntity(
            participant.entity,
            participantResolveContext(
              spatialReads,
              partyCompositionBySide,
              participant
            )
          ).components.skills ?? [],
      },
    ]
  })
  if (sheetParticipants.length === 0) return {}

  const pronounsRows = await executor
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
