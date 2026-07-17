import { forbidden } from "next/navigation"

import { loadTemplateSetRowById } from "@/lib/db/queries/load-template-set"
import type { TemplateSetRow } from "@/lib/db/schema/template-set"

import { auth } from "./index"

/**
 * Authorization gate for Template-Set-owner-only mutations — the authoring side of
 * the boundary, the exact parallel of {@link import("./map-access").requireMapOwner}
 * on the `templateSet` table. A Template Set is **user-owned**
 * (`templateSet.userId`, Procedural Dungeons PRD, *Template Sets*): editing it
 * requires being that owner.
 *
 * Loads the (non-soft-deleted) Set by id, compares its `userId` to the current
 * session's user id, and trips `forbidden()` (HTTP 403) on any mismatch — missing
 * session, missing/deleted Set, or signed-in-but-not-the-owner. Returns the loaded
 * row on success so callers don't re-query.
 */
export async function requireTemplateSetOwner(
  templateSetId: string
): Promise<TemplateSetRow> {
  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) forbidden()

  const templateSet = await loadTemplateSetRowById(templateSetId)
  if (!templateSet || templateSet.userId !== viewerId) forbidden()

  return templateSet
}
