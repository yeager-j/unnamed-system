import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import type { HydratedCharacter } from "@/lib/game/hydrated-character"

import { Prose } from "./shared/prose"

/**
 * Read-only Notes block (PRD §6.1 Explore tab). Renders the player's free
 * text Notes through {@link Prose} so line breaks and light Markdown survive
 * — Notes is the most freeform of all sheet surfaces, so the formatting
 * latitude matters most here. Missing content collapses to a muted line
 * so the block still presents on a clean character.
 */
export function Notes({ character }: { character: HydratedCharacter }) {
  const text = character.notes
  const isEmpty = !text || text.trim().length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-sm text-muted-foreground">None recorded.</p>
        ) : (
          <Prose>{text}</Prose>
        )}
      </CardContent>
    </Card>
  )
}
