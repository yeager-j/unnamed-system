import "server-only"

import type { TrustedViewer, Viewer } from "@workspace/game-v2/visibility"

import { isCampaignMember } from "@/lib/db/queries/load-campaign"
import type { CampaignRow } from "@/lib/db/schema/campaign"

import { auth } from "./index"

/**
 * The **one production mint of {@link TrustedViewer}** (UNN-530) — the trust
 * boundary the v2 visibility layer's projections demand. Every field is derived
 * server-side from the authenticated session; nothing here reads client input:
 *
 * - `isDm` — the campaign row's `dmUserId` vs the signed-in user.
 * - `ownedEntityIds` — the durable participants (from the encounter's own
 *   locator map) whose character row the signed-in user owns. Ownership is a
 *   capability on the **entity** id, so a charmed PC still reads `own` to its
 *   player while its allegiance sits with the enemies.
 * - `side` — `"players"` iff the viewer belongs to the campaign (a
 *   `campaignUsers` row, or owning a durable participant in this encounter,
 *   which implies it): a member whose PC sat the fight out still watches as an
 *   ally. Anyone else — signed-out, or a stranger to the campaign — is a
 *   sideless spectator (least privilege).
 *
 * This module is `server-only` and holds the single sanctioned
 * `as TrustedViewer` cast; everything downstream proves derivation happened by
 * type. Unlike its `campaign-access.ts` siblings this is **not a gate** — a
 * spectator is a valid viewer, so it never trips `forbidden()`.
 */
export async function deriveViewer(input: {
  campaign: Pick<CampaignRow, "id" | "dmUserId">
  /** Each durable participant's character `ownerId`, keyed by entity id. */
  durableOwners: ReadonlyMap<string, string>
}): Promise<TrustedViewer> {
  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) return mint({ isDm: false, side: null, owned: [] })

  if (input.campaign.dmUserId === viewerId) {
    return mint({ isDm: true, side: null, owned: [] })
  }

  const owned = [...input.durableOwners.entries()]
    .filter(([, ownerId]) => ownerId === viewerId)
    .map(([entityId]) => entityId)

  const belongsToCampaign =
    owned.length > 0 || (await isCampaignMember(input.campaign.id, viewerId))

  return mint({
    isDm: false,
    side: belongsToCampaign ? "players" : null,
    owned,
  })
}

function mint(fields: {
  isDm: boolean
  side: "players" | null
  owned: string[]
}): TrustedViewer {
  const viewer: Viewer = {
    isDm: fields.isDm,
    side: fields.side,
    ownedEntityIds: new Set(fields.owned),
  }
  return viewer as TrustedViewer
}
