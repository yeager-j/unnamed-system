import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { SetEditor } from "@/app/stage/_components/set-editor/set-editor"
import { toTemplateSetCanon } from "@/domain/template-set/load-canon"
import { auth } from "@/lib/auth"
import { loadMapOptionsByUserId } from "@/lib/db/queries/load-map"
import { loadTemplateSetByShortId } from "@/lib/db/queries/load-template-set"
import type { TemplateSetRow } from "@/lib/db/schema/template-set"

interface PageProps {
  params: Promise<{ shortId: string }>
}

/** Per-request memoized Set lookup so `generateMetadata` and the page share one
 *  read. */
const getTemplateSet = cache(
  async (shortId: string): Promise<TemplateSetRow | null> =>
    loadTemplateSetByShortId(shortId)
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const set = await getTemplateSet(shortId)

  return {
    title: set ? `${set.name} — Showtime!` : "Set not found — Showtime!",
  }
}

/**
 * The Template Set editor at `/stage/sets/{shortId}` (UNN-588), owner-only. A
 * non-owner (signed out, or signed in as someone else) gets `notFound()` — same
 * as the Map editor, so a stranger with the URL can't tell the Set exists.
 *
 * The page also loads the owner's Maps as `{ id, name }` options — the portal
 * picker binds them, and their ids feed the lint's `mapIds` vocab (an
 * unresolvable `portalMapId` is a finding, not a crash).
 */
export default async function SetEditorPage({ params }: PageProps) {
  const { shortId } = await params
  const set = await getTemplateSet(shortId)
  if (!set) notFound()

  const session = await auth()
  if (session?.user?.id !== set.userId) notFound()

  const mapOptions = await loadMapOptionsByUserId(set.userId)

  return (
    <SetEditor
      set={set}
      canon={toTemplateSetCanon(set)}
      mapOptions={mapOptions}
    />
  )
}
