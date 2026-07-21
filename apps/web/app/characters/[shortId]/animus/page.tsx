import type { Metadata } from "next"
import { forbidden, notFound, redirect } from "next/navigation"

import { parseDocumentRef } from "@/domain/character/animus/documents"
import {
  loadCharacterByShortId,
  toCharacterMount,
} from "@/domain/character/load"
import { redactLoadedCharacterForViewer } from "@/domain/character/redact"
import { getViewerRole } from "@/lib/auth/viewer-role"
import { characterBuilderPath } from "@/lib/paths"

import { AnimusWriterShell } from "./_components/animus-writer-shell"

/**
 * The Animus writer on the live sheet (UNN-221): the owner's full-screen edit
 * surface for the narrative fields (Backstory, Knives, Chains, Identity Traits)
 * plus Notes — the same sidebar+pane writer the builder's Movement 3 renders,
 * lifted onto a standalone route so a section click on the read-only sheet
 * expands into it (`?doc=` deep-links to the clicked section).
 *
 * **Owner-only**, enforced twice: this loader `forbidden()`s a non-owner before
 * the shell mounts, and every write still passes the entity door's
 * `requireEntityOwner` (403). A draft owner is bounced to the builder's Animus
 * movement — the builder is a draft's edit surface, this route is the finalized
 * sheet's.
 */

export const metadata: Metadata = { title: "Your Story — Showtime!" }

interface PageProps {
  params: Promise<{ shortId: string }>
  searchParams: Promise<{ doc?: string }>
}

export default async function CharacterAnimusPage({
  params,
  searchParams,
}: PageProps) {
  const { shortId } = await params
  const { doc } = await searchParams

  const loaded = await loadCharacterByShortId(shortId)
  if (!loaded) notFound()

  const role = await getViewerRole(loaded.profile)
  if (role !== "owner") forbidden()

  if (loaded.profile.status === "draft") {
    redirect(characterBuilderPath(shortId, "animus"))
  }

  const redacted = redactLoadedCharacterForViewer(loaded, role)
  const initialRef = parseDocumentRef(
    doc,
    redacted.entity.components.narrative,
    { includeNotes: true }
  )

  return (
    <AnimusWriterShell
      shortId={shortId}
      character={toCharacterMount(redacted)}
      initialRef={initialRef}
    />
  )
}
