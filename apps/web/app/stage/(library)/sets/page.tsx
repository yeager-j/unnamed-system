import type { Metadata } from "next"

import { SignedOutLanding } from "@/app/_components/signed-out-landing"
import { CreateSetButton } from "@/app/stage/_components/create-set-button"
import { SetCard } from "@/app/stage/_components/set-card"
import { auth } from "@/lib/auth"
import { loadTemplateSetsByUserId } from "@/lib/db/queries/load-template-set"

export const metadata: Metadata = {
  title: "Template Sets — Showtime!",
}

/**
 * Template Sets (UNN-588): the signed-in viewer's user-owned generation
 * grammars, with a Create CTA. Mirrors My Maps; signed-out viewers get the
 * sign-in panel — Sets are owner-private (there is no public Set surface).
 */
export default async function SetsPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
        <SignedOutLanding />
      </div>
    )
  }

  const sets = await loadTemplateSetsByUserId(session.user.id)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Template Sets</h1>
        <CreateSetButton />
      </header>

      {sets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You don&apos;t have any template sets yet. Create your first set to
          start authoring the zones a Region generates from.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map((set) => (
            <li key={set.id}>
              <SetCard set={set} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
