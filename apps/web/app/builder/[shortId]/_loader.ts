import { cache } from "react"

import { loadCharacterRowByShortId } from "@/lib/db/load-character"

/**
 * Per-request memoized draft loader shared by the builder route's layout,
 * index page, and step pages so the row is fetched once per render.
 * Lives outside `layout.tsx` because Next 16 restricts what a route
 * module can export.
 */
export const getBuilderCharacter = cache(async (shortId: string) => {
  return loadCharacterRowByShortId(shortId)
})
