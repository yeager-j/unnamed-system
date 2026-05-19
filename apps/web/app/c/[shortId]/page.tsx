import { cache } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Affinities } from "@/components/character-sheet/affinities"
import { SheetHeader } from "@/components/character-sheet/sheet-header"
import { Virtues } from "@/components/character-sheet/virtues"
import { loadHydratedCharacterByShortId } from "@/lib/db/load-character"
import { archetypeDisplayName } from "@/lib/game/archetypes"

/**
 * The public, read-only character sheet at `/c/{shortId}`. UNN-143 landed the
 * route, the single typed data spine ({@link loadHydratedCharacterByShortId}),
 * and graceful 404s; UNN-145 fills the Header + Vitals, and UNN-146 the
 * always-visible Attributes (in the header) plus the Virtues and Affinities
 * sections. The remaining PRD §6 sections are still dashed placeholders, filled
 * in by the sibling tickets, each reading what it needs off the hydrated
 * character.
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

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const character = await getCharacter(shortId)

  if (!character) {
    return { title: "Character not found — Unnamed System" }
  }

  const title = `${character.name} — Unnamed System`
  const description = `Level ${character.level} ${archetypeDisplayName(
    character.activeArchetypeKey
  )} — ${character.name}'s character sheet for the Unnamed System.`

  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
  }
}

const PLACEHOLDER_SECTIONS = [
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
      <SheetHeader character={character} />

      <div className="flex flex-col gap-4">
        <section aria-label="Virtues">
          <Virtues character={character} />
        </section>
        <section aria-label="Affinities">
          <Affinities character={character} />
        </section>

        {PLACEHOLDER_SECTIONS.map((section) => (
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
