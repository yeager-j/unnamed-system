import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { MapEditor } from "@/app/stage/_components/map-editor"
import type { MapAuthoringOptions } from "@/components/shared/canvas/map-canvas-context"
import { auth } from "@/lib/auth"
import {
  loadMapByShortId,
  loadMapOptionsByUserId,
} from "@/lib/db/queries/load-map"
import { loadTemplateSetsByUserId } from "@/lib/db/queries/load-template-set"
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
    title: map ? `${map.name} — Showtime!` : "Map not found — Showtime!",
  }
}

/**
 * The Map editor at `/stage/maps/{shortId}` (UNN-460/UNN-587), owner-only. A
 * non-owner (signed out, or signed in as someone else) gets `notFound()` — same
 * as the campaign manage page, so a stranger with the URL can't tell the Map
 * exists. Map editing is the template owner's alone (`requireMapOwner` gates the
 * writes; this is the read-side mirror).
 */
export default async function MapEditorPage({ params }: PageProps) {
  const { shortId } = await params
  const map = await getMap(shortId)
  if (!map) notFound()

  const session = await auth()
  if (session?.user?.id !== map.userId) notFound()

  // The generation-binding picker options (UNN-590): the union of template keys
  // across the owner's Sets (grouped by set; identical keys dedupe — the key is
  // the fact, the picker is typo-prevention) and the owner's other Maps as
  // portal targets. No referential integrity — the Region binds Map + Set, and
  // expedition start + set lint are the enforcement points.
  const [templateSets, mapOptions] = await Promise.all([
    loadTemplateSetsByUserId(map.userId),
    loadMapOptionsByUserId(map.userId),
  ])
  const seenKeys = new Set<string>()
  const templateKeys: MapAuthoringOptions["templateKeys"] = []
  for (const set of templateSets) {
    for (const templateKey of set.content.templateOrder) {
      const template = set.content.templates[templateKey]
      if (template === undefined || seenKeys.has(templateKey)) continue
      seenKeys.add(templateKey)
      templateKeys.push({
        key: templateKey,
        label: template.name.trim().length > 0 ? template.name : templateKey,
        setName: set.name,
      })
    }
  }
  const authoring: MapAuthoringOptions = {
    templateKeys,
    maps: mapOptions.filter((option) => option.id !== map.id),
  }

  return <MapEditor map={map} authoring={authoring} />
}
