import { createBeatAction } from "@/lib/actions/campaign-notes/beat"
import type { CampaignFolderKind } from "@/lib/db/schema/campaign-folder"

import { mintParticipantRef } from "../world/mint-participant-ref"

/**
 * The tree header's ＋ and a folder's "New … here" (UNN-617): quick-mints an
 * item of the rail's kind into `folderId` (null ⇒ Unfiled) and returns its id
 * so the tree can route to the fresh page. A name is all any of the three
 * needs — prose, traits, and schedule are authored on the page.
 */
export async function mintTreeItem(
  kind: CampaignFolderKind,
  campaignId: string,
  name: string,
  folderId: string | null
): Promise<string | null> {
  if (kind === "session") {
    const result = await createBeatAction({ campaignId, folderId, title: name })
    return result.ok ? result.value.id : null
  }
  const ref = await mintParticipantRef(kind, campaignId, name, folderId)
  return ref?.id ?? null
}
