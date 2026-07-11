import type { Metadata } from "next"

import { CharacterCard } from "@/components/my-characters/character-card"
import { CreateCharacterButton } from "@/components/my-characters/create-character-button"
import { EmptyCharacters } from "@/components/my-characters/empty-state"
import { SignedOutLanding } from "@/components/my-characters/signed-out-landing"
import { auth } from "@/lib/auth"
import { loadOwnedCharacterSummaries } from "@/lib/db/queries/character-list"

export const metadata: Metadata = {
  title: "My Characters — Showtime!",
}

/**
 * The My Characters home page (PRD §4, UNN-177). For signed-in viewers, a
 * card grid of every character whose `ownerId` matches their user id, with a
 * disabled Create CTA until the Character Builder ships. For signed-out
 * viewers, a sign-in panel — the public character sheet at `/characters/{shortId}`
 * remains accessible without an account, this surface just gates the roster.
 */
export default async function MyCharactersPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
        <SignedOutLanding />
      </main>
    )
  }

  const characters = await loadOwnedCharacterSummaries(session.user.id)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">My Characters</h1>
        <CreateCharacterButton />
      </header>

      {characters.length === 0 ? (
        <EmptyCharacters />
      ) : (
        <ul
          role="list"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {characters.map((character) => (
            <li key={character.id}>
              <CharacterCard character={character} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
