import type { Metadata } from "next"

import { SignedOutLanding } from "@/app/_components/signed-out-landing"
import { CreateMapButton } from "@/app/stage/_components/create-map-button"
import { MapCard } from "@/app/stage/_components/map-card"
import { auth } from "@/lib/auth"
import { loadMapsByUserId } from "@/lib/db/queries/load-map"

export const metadata: Metadata = {
  title: "My Maps — Showtime!",
}

/**
 * My Maps (UNN-460): the signed-in viewer's user-owned dungeon Map templates,
 * with a Create CTA. Mirrors My Campaigns; signed-out viewers get the sign-in
 * panel — Maps are owner-private (there is no public Map surface).
 */
export default async function MapsPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
        <SignedOutLanding />
      </div>
    )
  }

  const maps = await loadMapsByUserId(session.user.id)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">My Maps</h1>
        <CreateMapButton />
      </header>

      {maps.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You don&apos;t have any maps yet. Create your first map to start
          building a dungeon.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {maps.map((map) => (
            <li key={map.id}>
              <MapCard map={map} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
