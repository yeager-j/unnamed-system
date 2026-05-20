import { cache } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Affinities } from "@/components/character-sheet/affinities"
import { Archetypes } from "@/components/character-sheet/archetypes"
import { CharacterProvider } from "@/components/character-sheet/character-context"
import { CombatState } from "@/components/character-sheet/combat-state"
import { Inventory } from "@/components/character-sheet/inventory"
import { MechanicWidget } from "@/components/character-sheet/mechanics/mechanic-widget"
import { SheetHeader } from "@/components/character-sheet/sheet-header"
import {
  SHEET_TAB_KEYS,
  type SheetTabKey,
} from "@/components/character-sheet/sheet-tab-keys"
import { SheetTabs } from "@/components/character-sheet/sheet-tabs"
import { Skills } from "@/components/character-sheet/skills"
import { Virtues } from "@/components/character-sheet/virtues"
import { loadHydratedCharacterByShortId } from "@/lib/db/load-character"
import { archetypeDisplayName } from "@/lib/game/archetypes"

/**
 * The public, read-only character sheet at `/c/{shortId}`. UNN-143 landed the
 * route + typed data spine ({@link loadHydratedCharacterByShortId}); UNN-145/146
 * filled the persistent header (identity, HP/SP, Attributes, Victories). UNN-154
 * organizes the body into four play-context tabs (Combat / Explore / Inventory /
 * Archetypes) above which the header stays fixed. Sections not yet built are
 * dashed placeholders within their tab, filled in by sibling tickets, each
 * reading what it needs off the hydrated character. The active tab is
 * `?tab=`-addressable so a specific view is shareable.
 */

interface PageProps {
  params: Promise<{ shortId: string }>
  searchParams: Promise<{ tab?: string }>
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

/** Sections not yet built — a labelled dashed box, filled by sibling tickets. */
function Placeholder({ name }: { name: string }) {
  return (
    <section
      aria-label={name}
      className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
    >
      {name}
    </section>
  )
}

const EXPLORE_PLACEHOLDERS = ["Talents", "Identity", "Notes"] as const

function resolveTab(tab: string | undefined): SheetTabKey {
  return tab && (SHEET_TAB_KEYS as readonly string[]).includes(tab)
    ? (tab as SheetTabKey)
    : "combat"
}

export default async function CharacterSheetPage({
  params,
  searchParams,
}: PageProps) {
  const { shortId } = await params
  const { tab } = await searchParams
  const character = await getCharacter(shortId)

  if (!character) {
    notFound()
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col gap-8 p-6">
      <SheetHeader character={character} />

      <CharacterProvider character={character}>
        <SheetTabs
          defaultTab={resolveTab(tab)}
          combat={
            <>
              <section aria-label="Affinities">
                <Affinities character={character} />
              </section>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {character.activeMechanic ? (
                  <section aria-label="Archetype Mechanic">
                    <MechanicWidget />
                  </section>
                ) : null}
                <section aria-label="Combat State">
                  <CombatState character={character} />
                </section>
              </div>
              <section aria-label="Skills">
                <Skills character={character} />
              </section>
            </>
          }
          explore={
            <>
              <section aria-label="Virtues">
                <Virtues character={character} />
              </section>
              {EXPLORE_PLACEHOLDERS.map((name) => (
                <Placeholder key={name} name={name} />
              ))}
            </>
          }
          inventory={<Inventory character={character} />}
          archetypes={<Archetypes character={character} />}
        />
      </CharacterProvider>
    </main>
  )
}
