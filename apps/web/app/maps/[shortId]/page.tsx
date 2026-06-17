import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { MapEditor } from "@/components/maps/map-editor"
import { auth } from "@/lib/auth"
import { loadMapByShortId } from "@/lib/db/queries/load-map"
import type { MapRow } from "@/lib/db/schema/map"

interface PageProps {
  params: Promise<{ shortId: string }>
}

/** Per-request memoized Map lookup so `generateMetadata` and the page share one
 *  read. */
const getMap = cache(
  async (shortId: string): Promise<MapRow | null> => loadMapByShortId(shortId)
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const map = await getMap(shortId)

  return {
    title: map
      ? `${map.name} — Unnamed System`
      : "Map not found — Unnamed System",
  }
}

/**
 * The Map editor at `/maps/{shortId}` (UNN-460), owner-only. A non-owner (signed
 * out, or signed in as someone else) gets `notFound()` — same as the campaign
 * manage page, so a stranger with the URL can't tell the Map exists. Map editing
 * is the template owner's alone (`requireMapOwner` gates the writes; this is the
 * read-side mirror).
 */
export default async function MapEditorPage({ params }: PageProps) {
  const { shortId } = await params
  const map = await getMap(shortId)
  if (!map) notFound()

  const session = await auth()
  if (session?.user?.id !== map.userId) notFound()

  return <MapEditor map={map} />
}
