import type { ParticipantRef } from "@/domain/planner/participant"
import { mintArticleAction } from "@/lib/actions/campaign-world/mint-article"
import { mintNpcAction } from "@/lib/actions/campaign-world/mint-npc"

/** Runs a world-web quick mint and returns the participant ref editors insert. */
export async function mintParticipantRef(
  kind: "npc" | "article",
  campaignId: string,
  name: string
): Promise<ParticipantRef | null> {
  if (kind === "npc") {
    const result = await mintNpcAction({ campaignId, name })
    if (!result.ok) return null
    return { kind: "npc", id: result.value.entityId, label: name }
  }
  const result = await mintArticleAction({ campaignId, name })
  if (!result.ok) return null
  return { kind: "article", id: result.value.id, label: name }
}
