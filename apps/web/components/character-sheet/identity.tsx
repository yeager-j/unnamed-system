import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import type { IdentityList } from "@/lib/game/character"
import type { HydratedCharacter } from "@/lib/game/hydrated-character"

import { Prose } from "./shared/prose"

/**
 * Read-only Identity block (PRD §6.1 Explore tab). Renders the five Identity
 * lists in a fixed order so the section reads the same on every character;
 * each list's items pass through {@link Prose} so a player can use light
 * Markdown (line breaks, emphasis, links) in any entry. Empty lists render
 * one muted "None recorded." line under their label rather than disappearing,
 * keeping the block scannable on a clean character. No edit affordances.
 */
export function Identity({ character }: { character: HydratedCharacter }) {
  const sections: ReadonlyArray<{ label: string; items: IdentityList }> = [
    { label: "Personality Traits", items: character.personalityTraits },
    { label: "Hopes", items: character.hopes },
    { label: "Dreams", items: character.dreams },
    { label: "Fears", items: character.fears },
    { label: "Secrets", items: character.secrets },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sections.map(({ label, items }) => (
          <IdentitySection key={label} label={label} items={items} />
        ))}
      </CardContent>
    </Card>
  )
}

function IdentitySection({
  label,
  items,
}: {
  label: string
  items: IdentityList
}) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None recorded.</p>
      ) : (
        <ul className="ml-5 list-disc text-sm marker:text-muted-foreground">
          {items.map((item, index) => (
            <li key={index}>
              <Prose className="prose-p:my-0">{item}</Prose>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
