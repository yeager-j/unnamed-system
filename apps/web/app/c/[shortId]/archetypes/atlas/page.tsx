import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { slugForStepIndex } from "@/components/builder/builder-steps"
import { LineageAtlas } from "@/components/character-sheet/archetypes/atlas/lineage-atlas"
import { ViewerRoleProvider } from "@/components/shell/viewer-role"
import { CharacterProvider } from "@/hooks/use-character"
import { getViewerRole } from "@/lib/auth/viewer-role"
import { loadHydratedCharacterByShortId } from "@/lib/db/queries/load-character"

/**
 * The Lineage Atlas (UNN-239) — the owner-only *growth* surface for spending
 * Saved Archetype Ranks. A dedicated route under the sheet rather than a tab:
 * unlocking and ranking up Archetypes is a focused, full-page task.
 *
 * Owner-gated. A non-owner (signed-in or out) is redirected to the public
 * sheet — the Atlas has no read-only mode, and the Server Actions behind it
 * trip `forbidden()` regardless. A draft's owner is bounced into the builder,
 * mirroring the sheet route.
 */

interface PageProps {
  params: Promise<{ shortId: string }>
}

export const metadata: Metadata = {
  title: "Lineage Atlas — Unnamed System",
  robots: { index: false, follow: false },
}

export default async function LineageAtlasPage({ params }: PageProps) {
  const { shortId } = await params
  const character = await loadHydratedCharacterByShortId(shortId)

  if (!character) {
    notFound()
  }

  const role = await getViewerRole(character)
  if (role !== "owner") {
    redirect(`/c/${shortId}`)
  }

  if (character.status === "draft") {
    redirect(`/builder/${shortId}/${slugForStepIndex(character.builderStep)}`)
  }

  return (
    <ViewerRoleProvider role={role}>
      <CharacterProvider character={character}>
        <LineageAtlas />
      </CharacterProvider>
    </ViewerRoleProvider>
  )
}
