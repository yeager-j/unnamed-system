import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"

import { DeleteSetButton } from "@/app/stage/_components/delete-set-button"
import { auth } from "@/lib/auth"
import { loadTemplateSetByShortId } from "@/lib/db/queries/load-template-set"
import type { TemplateSetRow } from "@/lib/db/schema/template-set"
import { stageSetsPath } from "@/lib/paths"

interface PageProps {
  params: Promise<{ shortId: string }>
}

/** Per-request memoized Set lookup so `generateMetadata` and the page share one
 *  read. */
const getTemplateSet = cache(
  async (shortId: string): Promise<TemplateSetRow | null> =>
    loadTemplateSetByShortId(shortId)
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const set = await getTemplateSet(shortId)

  return {
    title: set ? `${set.name} — Showtime!` : "Set not found — Showtime!",
  }
}

/**
 * The Template Set editor at `/stage/sets/{shortId}` (UNN-588), owner-only. A
 * non-owner (signed out, or signed in as someone else) gets `notFound()` — same
 * as the Map editor, so a stranger with the URL can't tell the Set exists.
 *
 * **P1a shell**: the create flow needs this route to land on (create → redirect),
 * so it renders the set header + delete; the master-detail editor (templates |
 * tables | lint rail) replaces this body in P1b.
 */
export default async function SetEditorPage({ params }: PageProps) {
  const { shortId } = await params
  const set = await getTemplateSet(shortId)
  if (!set) notFound()

  const session = await auth()
  if (session?.user?.id !== set.userId) notFound()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <Link
        href={stageSetsPath()}
        className="text-sm text-muted-foreground hover:underline"
      >
        &larr; Template Sets
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">{set.name}</h1>
        <DeleteSetButton templateSetId={set.id} setName={set.name} />
      </header>
      <p className="text-sm text-muted-foreground">
        The set editor — templates, tables, and the live lint — lands with P1b.
      </p>
    </div>
  )
}
