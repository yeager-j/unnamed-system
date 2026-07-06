import { inArray } from "drizzle-orm"

import type { Session } from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { getArchetype } from "@workspace/game/data"

import type { ParticipantMeta } from "@/app/combat/[shortId]/encounter-access"
import type { DurableHydration } from "@/lib/combat/view/detail-view"
import { db } from "@/lib/db/client"
import { entity } from "@/lib/db/schema/entity"

/**
 * The per-**durable-participant** drawer hydration (UNN-535; UNN-551) — the two
 * fields the resolved session view doesn't already carry: the active Archetype's
 * **display name** (a catalog lookup off the entity's own `archetypes.active`, in
 * the session already) and the **pronouns** app column (batch-read from `entity`).
 *
 * **Skills are no longer loaded here.** The drawer renders each combatant's skills
 * from the resolved participant view uniformly — the durable-only rich `HydratedSkill`
 * hydration (and its party-composition second pass) is gone with the storage fork;
 * UNN-538 restores rich `ResolvedSkill` cards for *every* combatant off that same view.
 * Keyed by **participantId**, storage decided once off {@link ParticipantMeta}.
 */
export async function loadCombatConsoleDataV2(
  session: Session,
  participantMeta: Record<ParticipantId, ParticipantMeta>
): Promise<Record<ParticipantId, DurableHydration>> {
  const durable = session.participants.flatMap((participant) => {
    const meta = participantMeta[participant.id]
    if (meta?.storage !== "durable") return []
    const activeKey = participant.entity.components.archetypes?.active
    return [
      {
        participantId: participant.id,
        entityId: meta.characterId,
        className: activeKey ? (getArchetype(activeKey)?.name ?? null) : null,
      },
    ]
  })
  if (durable.length === 0) return {}

  const pronounsRows = await db
    .select({ id: entity.id, pronouns: entity.pronouns })
    .from(entity)
    .where(inArray(entity.id, [...new Set(durable.map((pc) => pc.entityId))]))
  const pronounsById = new Map(
    pronounsRows.map((row) => [row.id, row.pronouns])
  )

  return Object.fromEntries(
    durable.map((pc) => [
      pc.participantId,
      {
        className: pc.className,
        pronouns: pronounsById.get(pc.entityId) ?? null,
      } satisfies DurableHydration,
    ])
  )
}
