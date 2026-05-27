import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getTalent, type HydratedCharacter } from "@/lib/game/character"

/**
 * Read-only Talents block (PRD §6.1 Explore tab). Lists every Talent the
 * character knows — the deduplicated union of `gainedTalents` and the active
 * Archetype's Talents, pre-sorted by `resolveTalents` — resolving each slug
 * to its display name via the canonical Talent table. Empty roster shows a
 * single muted line instead of an empty card body — the tab-level "clean
 * character renders coherently" requirement. No Add/Remove controls;
 * mutations are owner-mode and out of scope.
 */
export function Talents({ character }: { character: HydratedCharacter }) {
  const names = character.talents.map((key) => getTalent(key)?.name ?? key)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Talents</CardTitle>
      </CardHeader>
      <CardContent>
        {names.length === 0 ? (
          <p className="text-sm text-muted-foreground">None recorded.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
