import { forbidden, notFound, redirect } from "next/navigation"
import { type ReactNode } from "react"

import { BuilderProviderShell } from "@/components/builder/builder-provider-shell"
import { auth } from "@/lib/auth"

import { getBuilderCharacter } from "./_loader"

/**
 * The builder route gate. Loads the draft row by `shortId` once per
 * request (memoized via `getBuilderCharacter`), enforces that the viewer
 * is the owner, and redirects finalized characters to their public sheet
 * (the builder isn't useful for a complete character).
 *
 * Wraps the rendered tree in {@link BuilderProviderShell}, which mounts
 * the Movement 3 writer's `SidebarProvider` at the layout level so the
 * left rail (and its open document) persists across intra-builder
 * navigation. The provider is always mounted; the visible `<Sidebar>`
 * content is gated on the active step inside the shell.
 *
 * The chapter header chrome (title, blurb, stepper) lives in each step's
 * `page.tsx` rather than this layout because Next's layout can't read
 * child segment params and we need the current step slug to render the
 * right header/stepper highlight.
 */

export default async function BuilderLayout({
  params,
  children,
}: {
  params: Promise<{ shortId: string }>
  children: ReactNode
}) {
  const { shortId } = await params

  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) forbidden()

  const character = await getBuilderCharacter(shortId)
  if (!character) notFound()
  if (character.ownerId !== viewerId) forbidden()
  if (character.status === "finalized") redirect(`/c/${shortId}`)

  return (
    <BuilderProviderShell character={character}>{children}</BuilderProviderShell>
  )
}
