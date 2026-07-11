import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { LineageAtlas } from "@/app/characters/[shortId]/atlas/_components/lineage-atlas"
import { ViewerRoleProvider } from "@/components/shell/viewer-role"
import { hiddenArchetypeKeysFor } from "@/domain/archetypes/restricted"
import { slugForStepIndex } from "@/domain/character/builder-steps"
import { loadCharacterByShortId } from "@/domain/character/load"
import { redactLoadedCharacterForViewer } from "@/domain/character/redact"
import { EntityWriteProvider } from "@/domain/entity/use-entity-write"
import { auth } from "@/lib/auth"
import { getViewerRole } from "@/lib/auth/viewer-role"
import { characterBuilderPath, characterPath } from "@/lib/paths"

/**
 * The Lineage Atlas (UNN-239) — the *growth* surface for spending Saved
 * Archetype Ranks. A dedicated route under the sheet rather than a tab:
 * unlocking and ranking up Archetypes is a focused, full-page task.
 *
 * Publicly viewable, read-only for non-owners (UNN-276): the page renders the
 * full tier-tree map for everyone and gates the owner-mode chrome inside
 * {@link LineageAtlas} with `OwnerOnly`. The Server Actions behind that chrome
 * trip `forbidden()` regardless, so this is a richer public roster than the
 * retired Archetypes-tab list with no new exposure. Drafts never render here:
 * the owner is bounced into the builder, everyone else to the sheet (which
 * shows the "not ready" dialog), mirroring the sheet route.
 */

interface PageProps {
  params: Promise<{ shortId: string }>
}

export const metadata: Metadata = {
  title: "Lineage Atlas — Showtime!",
  robots: { index: false, follow: false },
}

export default async function LineageAtlasPage({ params }: PageProps) {
  const { shortId } = await params
  const loaded = await loadCharacterByShortId(shortId)

  if (!loaded) {
    notFound()
  }

  const role = await getViewerRole(loaded.profile)

  if (loaded.profile.status === "draft") {
    if (role === "owner") {
      redirect(
        characterBuilderPath(
          shortId,
          slugForStepIndex(loaded.profile.builderStep)
        )
      )
    }
    redirect(characterPath(shortId))
  }

  const session = await auth()
  const hiddenArchetypeKeys = hiddenArchetypeKeysFor(session?.user?.email)

  return (
    <ViewerRoleProvider role={role}>
      <EntityWriteProvider
        loaded={redactLoadedCharacterForViewer(loaded, role)}
      >
        <LineageAtlas hiddenArchetypeKeys={hiddenArchetypeKeys} />
      </EntityWriteProvider>
    </ViewerRoleProvider>
  )
}
