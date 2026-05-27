import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { Prose } from "@/components/shared/prose"
import type {
  CharacterChainRow,
  CharacterKnifeRow,
} from "@/lib/db/load-character"
import type { HydratedCharacter } from "@/lib/game/character/stats/hydrated-character"

type IdentityEntry = CharacterKnifeRow | CharacterChainRow

/**
 * Read-only Knives & Chains block (PRD §6.1 Explore tab). Knives (oaths /
 * vendettas the character refuses to break) and Chains (relationships that
 * bind them) are surfaced as title + paragraph pairs. Descriptions render
 * through {@link Prose} so a player's line breaks and light Markdown survive.
 * Both subsections always render their heading; an empty side shows a single
 * "None recorded." line so the block reads the same shape on any character.
 */
export function KnivesChains({ character }: { character: HydratedCharacter }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Knives &amp; Chains</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <EntrySection label="Knives" entries={character.knives} />
        <EntrySection label="Chains" entries={character.chains} />
      </CardContent>
    </Card>
  )
}

function EntrySection({
  label,
  entries,
}: {
  label: string
  entries: readonly IdentityEntry[]
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">None recorded.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1">
              <p className="text-sm font-medium">{entry.title}</p>
              {entry.description ? (
                <Prose className="prose-p:my-0">{entry.description}</Prose>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
