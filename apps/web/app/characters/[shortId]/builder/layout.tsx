import { forbidden, notFound, redirect } from "next/navigation"
import { type ReactNode } from "react"

import { BuilderProviderShell } from "@/app/characters/[shortId]/builder/_components/builder-provider-shell"
import { loadCharacterByShortId } from "@/domain/character/load"
import { auth } from "@/lib/auth"

/**
 * The builder route gate. Loads the draft entity by `shortId` once per
 * request (memoized via `loadCharacterByShortId`), enforces that the viewer
 * is the owner, and bounces finalized characters to My Characters (`/` — the
 * v2 sheet route arrives with S2a; the builder isn't useful for a complete
 * character either way).
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

  const loaded = await loadCharacterByShortId(shortId)
  if (!loaded) notFound()
  if (loaded.profile.ownerId !== viewerId) forbidden()
  if (loaded.profile.status === "finalized") redirect("/")

  return <BuilderProviderShell loaded={loaded}>{children}</BuilderProviderShell>
}
