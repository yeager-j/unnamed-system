import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import type { HydratedCharacter } from "@/lib/game/hydrated-character"

import { Prose } from "./shared/prose"

/**
 * Read-only Background block (PRD §6.1 Explore tab). Surfaces the three free
 * text fields a player writes during character creation: Ancestry, Background,
 * and Backstory. Each renders through {@link Prose} so line breaks and light
 * Markdown survive. All three labels are always rendered; missing content
 * collapses to a muted "None recorded." line so the block reads the same on
 * every character.
 */
export function Background({ character }: { character: HydratedCharacter }) {
  const sections: ReadonlyArray<{ label: string; text: string | null }> = [
    { label: "Ancestry", text: character.ancestryText },
    { label: "Background", text: character.backgroundText },
    { label: "Backstory", text: character.backstoryText },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Background</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sections.map(({ label, text }) => (
          <BackgroundSection key={label} label={label} text={text} />
        ))}
      </CardContent>
    </Card>
  )
}

function BackgroundSection({
  label,
  text,
}: {
  label: string
  text: string | null
}) {
  const isEmpty = !text || text.trim().length === 0
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      {isEmpty ? (
        <p className="text-sm text-muted-foreground">None recorded.</p>
      ) : (
        <Prose>{text}</Prose>
      )}
    </div>
  )
}
