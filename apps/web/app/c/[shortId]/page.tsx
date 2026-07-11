import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { slugForStepIndex } from "@/components/builder/builder-steps"
import { DraftInProgressDialog } from "@/components/c/draft-in-progress-dialog"
import { CharacterSheet } from "@/components/character-sheet/sheet"
import { ViewerRoleProvider } from "@/components/shell/viewer-role"
import { loadCharacterByShortId } from "@/domain/character/load"
import { redactLoadedCharacterForViewer } from "@/domain/character/redact"
import { getArchetype } from "@/domain/game-engine-v2"
import { getViewerRole } from "@/lib/auth/viewer-role"

/**
 * The character sheet at `/c/{shortId}` (S2a — UNN-557): the v2 entity sheet,
 * Showtime! redesign. The route is the read boundary's mount point:
 * {@link loadCharacterByShortId} loads + resolves once (React-cached, so
 * `generateMetadata` shares the query), and the client
 * {@link CharacterSheet} mounts the `EntityWriteProvider` over the loaded
 * triple — every interactive control dispatches descriptors through it.
 *
 * Publicly viewable; owner-mode controls render only for the owner
 * (`ViewerRoleProvider`). Drafts are scoped to their owner: the owner is
 * routed into the builder, everyone else sees the non-dismissable "not ready"
 * dialog (v1 parity, UNN-204).
 */

interface PageProps {
  params: Promise<{ shortId: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const loaded = await loadCharacterByShortId(shortId)

  if (!loaded) {
    return { title: "Character not found — Showtime!" }
  }
  if (loaded.profile.status === "draft") {
    return { title: "Character in progress — Showtime!" }
  }

  const { profile, entity, resolved } = loaded
  const activeKey = resolved.components.archetypes?.active
  const archetypeName = activeKey ? getArchetype(activeKey)?.name : undefined
  const level = entity.components.level?.value

  const title = `${profile.name} — Showtime!`
  const description = [
    level ? `Level ${level}` : null,
    archetypeName ?? null,
    `${profile.name}'s character sheet for Showtime!`,
  ]
    .filter(Boolean)
    .join(" — ")

  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
  }
}

export default async function CharacterSheetPage({ params }: PageProps) {
  const { shortId } = await params
  const loaded = await loadCharacterByShortId(shortId)

  if (!loaded) {
    notFound()
  }

  const role = await getViewerRole(loaded.profile)

  if (loaded.profile.status === "draft") {
    if (role === "owner") {
      redirect(
        `/builder/${shortId}/${slugForStepIndex(loaded.profile.builderStep)}`
      )
    }
    return <DraftInProgressDialog />
  }

  return (
    <ViewerRoleProvider role={role}>
      <CharacterSheet loaded={redactLoadedCharacterForViewer(loaded, role)} />
    </ViewerRoleProvider>
  )
}
