import { cache } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { loadHydratedCharacterByShortId } from "@/lib/db/load-character"
import { getArchetype } from "@/lib/game/archetypes"

/**
 * The public, read-only character sheet at `/c/{shortId}`. This ticket
 * (UNN-143) lands the route, the single typed data spine
 * ({@link loadHydratedCharacterByShortId}), graceful 404s, and a scaffold; the
 * PRD §6 section UIs are filled in by the tickets this one blocks
 * (UNN-145..151), each reading what it needs off the hydrated character.
 */

interface PageProps {
  params: Promise<{ shortId: string }>
}

/**
 * Per-request memoized load so `generateMetadata` and the page itself resolve
 * the character once, not twice.
 */
const getCharacter = cache((shortId: string) =>
  loadHydratedCharacterByShortId(shortId)
)

function archetypeName(activeArchetypeKey: string | null): string {
  return (
    (activeArchetypeKey ? getArchetype(activeArchetypeKey)?.name : undefined) ??
    "Adventurer"
  )
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const character = await getCharacter(shortId)

  if (!character) {
    return { title: "Character not found — Unnamed System" }
  }

  const title = `${character.name} — Unnamed System`
  const description = `Level ${character.level} ${archetypeName(
    character.activeArchetypeKey
  )} — ${character.name}'s character sheet for the Unnamed System.`

  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
  }
}

const SHEET_SECTIONS = [
  "Header",
  "Vitals",
  "Attributes",
  "Virtues",
  "Affinities",
  "Archetypes",
  "Skills",
  "Synthesis Skills",
  "Talents",
  "Equipment",
  "Identity",
  "Progression",
  "Combat State",
  "Notes",
] as const

export default async function CharacterSheetPage({ params }: PageProps) {
  const { shortId } = await params
  const character = await getCharacter(shortId)

  if (!character) {
    notFound()
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col gap-8 p-6">
      <header>
        <h1 className="text-3xl font-semibold">{character.name}</h1>
        {character.pronouns ? (
          <p className="text-sm text-muted-foreground">{character.pronouns}</p>
        ) : null}
        <p className="mt-1 text-sm text-muted-foreground">
          Level {character.level} {archetypeName(character.activeArchetypeKey)}
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {SHEET_SECTIONS.map((section) => (
          <section
            key={section}
            aria-label={section}
            className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
          >
            {section}
          </section>
        ))}
      </div>
    </main>
  )
}
