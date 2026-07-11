import { notFound, redirect } from "next/navigation"

import { slugForStepIndex } from "@/domain/character/builder-steps"
import { loadCharacterByShortId } from "@/domain/character/load"
import { characterBuilderPath } from "@/lib/paths"

/**
 * `/characters/[shortId]/builder` is the canonical entry — it doesn't render a
 * step itself, it bounces to the step the player last visited (per the
 * `builderStep` cursor on the row). The owner gate has already run in the
 * layout; the second lookup here is free (cached).
 */
export default async function BuilderEntryPage({
  params,
}: {
  params: Promise<{ shortId: string }>
}) {
  const { shortId } = await params
  const loaded = await loadCharacterByShortId(shortId)
  if (!loaded) notFound()

  redirect(
    characterBuilderPath(shortId, slugForStepIndex(loaded.profile.builderStep))
  )
}
