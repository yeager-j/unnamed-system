import {
  derivePartyCompositionBySide,
  type Session,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { zoneEnchantmentEffects } from "@workspace/game-v2/mechanics"
import type { MapInstanceState } from "@workspace/game-v2/spatial"
import { zoneOf } from "@workspace/game-v2/spatial/selectors"
import { getArchetype } from "@workspace/game/data"

import type { ParticipantMeta } from "@/app/combat/[shortId]/encounter-access"
import type { DurableHydration } from "@/lib/combat/view/detail-view"
import { loadHydratedCharacterById } from "@/lib/db/queries/load-character"
import { resolveSession } from "@/lib/game-engine-v2"

/**
 * The per-**durable-participant** hydration the v2 DM console's drawer needs
 * (UNN-535) — the lean successor of v1's `loadCombatConsoleData`. Everything a
 * combatant displays now comes off the resolved session (vitals, attributes,
 * affinities, names); what genuinely still lives on the character *row* is the
 * v1-shaped display slice this loads: the active Archetype's display name, the
 * pronouns, and the party-scaled Skill cards the shared `SkillRow` renders
 * (the `perPartyLineage` Attack-Roll scalers + a Toccata zone bonus resolve at
 * their encounter-scaled values, UNN-367).
 *
 * Keyed by **participantId** (the drawer's key), storage decided once off the
 * loader-projected {@link ParticipantMeta}. v1's `activeMechanic` pass-through
 * is gone: the v2 end-of-turn obligations read `activeMechanics` off the
 * resolved view, so no character-row mechanic plumbing survives.
 */
export async function loadCombatConsoleDataV2(
  session: Session,
  instanceState: MapInstanceState,
  participantMeta: Record<ParticipantId, ParticipantMeta>
): Promise<Record<ParticipantId, DurableHydration>> {
  const durable = session.participants.flatMap((participant) => {
    const meta = participantMeta[participant.id]
    if (meta?.storage !== "durable") return []
    return [
      {
        participantId: participant.id,
        characterId: meta.characterId,
        side: participant.overlay.allegiance.side,
        zoneId: zoneOf(instanceState, participant.id) ?? "",
      },
    ]
  })
  if (durable.length === 0) return {}

  const view = resolveSession(session, instanceState)
  const compositionBySide = derivePartyCompositionBySide(view)

  const entries = await Promise.all(
    durable.map(async (pc) => {
      const character = await loadHydratedCharacterById(pc.characterId, {
        partyComposition: compositionBySide[pc.side],
        zoneEffects: zoneEnchantmentEffects(
          instanceState.enchantment,
          pc.zoneId
        ),
      })
      if (!character) return null
      const hydration: DurableHydration = {
        className: character.activeArchetypeKey
          ? (getArchetype(character.activeArchetypeKey)?.name ?? null)
          : null,
        pronouns: character.pronouns,
        skills: character.skills,
      }
      return [pc.participantId, hydration] as const
    })
  )

  return Object.fromEntries(entries.filter((entry) => entry !== null))
}
