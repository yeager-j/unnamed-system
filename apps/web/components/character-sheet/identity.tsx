import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { Prose } from "@/components/shared/prose"
import type { HydratedCharacter } from "@/lib/game/character/stats/hydrated-character"

/**
 * Read-only Identity block (PRD §6.1 Explore tab). Renders the five
 * Identity sections in fixed order so the section reads the same on every
 * character. Each section is one Markdown blob (UNN-208), passed through
 * {@link Prose} — Markdown lists in the source render as bulleted lists
 * here. Empty sections render one muted "None recorded." line rather than
 * disappearing, keeping the block scannable on a clean character.
 */
export function Identity({ character }: { character: HydratedCharacter }) {
  const sections: ReadonlyArray<{ label: string; body: string | null }> = [
    { label: "Personality Traits", body: character.personalityTraits },
    { label: "Hopes", body: character.hopes },
    { label: "Dreams", body: character.dreams },
    { label: "Fears", body: character.fears },
    { label: "Secrets", body: character.secrets },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sections.map(({ label, body }) => (
          <IdentitySection key={label} label={label} body={body} />
        ))}
      </CardContent>
    </Card>
  )
}

function IdentitySection({
  label,
  body,
}: {
  label: string
  body: string | null
}) {
  const trimmed = body?.trim() ?? ""
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      {trimmed.length === 0 ? (
        <p className="text-sm text-muted-foreground">None recorded.</p>
      ) : (
        <Prose className="text-sm prose-p:my-0">{trimmed}</Prose>
      )}
    </div>
  )
}
