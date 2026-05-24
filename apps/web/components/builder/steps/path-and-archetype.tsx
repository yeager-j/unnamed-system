import { Separator } from "@workspace/ui/components/separator"

import type { PathChoice } from "@/lib/game/character"

import { OriginArchetypePicker } from "./origin-archetype-picker"
import { PathPicker } from "./path-picker"

/**
 * Step 2 of the builder — HP/SP Path picker on top, Origin Archetype picker
 * below. Both choices persist on the draft via Server Actions in the
 * canonical optimistic-toggle shape (UNN-180); the Next button gates on
 * Origin only since `pathChoice` is pre-seeded "balanced" on draft creation
 * and is therefore always satisfied. See PRD §5.1 / §5.2.
 */
export function PathAndArchetypeStep({
  characterId,
  pathChoice,
  originArchetypeKey,
  identityVersion,
}: {
  characterId: string
  pathChoice: PathChoice
  originArchetypeKey: string | null
  identityVersion: number
}) {
  return (
    <div className="flex flex-col gap-6">
      <PathPicker
        characterId={characterId}
        pathChoice={pathChoice}
        identityVersion={identityVersion}
      />
      <Separator />
      <OriginArchetypePicker
        characterId={characterId}
        pathChoice={pathChoice}
        originArchetypeKey={originArchetypeKey}
        identityVersion={identityVersion}
      />
    </div>
  )
}
