import { notFound, redirect } from "next/navigation"

import { slugForStepIndex } from "@/components/builder/builder-steps"

import { getBuilderCharacter } from "./_loader"

/**
 * `/builder/[shortId]` is the canonical entry — it doesn't render a step
 * itself, it bounces to the step the player last visited (per the
 * `builderStep` cursor on the row). The owner gate has already run in the
 * layout; the second lookup here is free (cached).
 */
export default async function BuilderEntryPage({
  params,
}: {
  params: Promise<{ shortId: string }>
}) {
  const { shortId } = await params
  const character = await getBuilderCharacter(shortId)
  if (!character) notFound()

  redirect(`/builder/${shortId}/${slugForStepIndex(character.builderStep)}`)
}
