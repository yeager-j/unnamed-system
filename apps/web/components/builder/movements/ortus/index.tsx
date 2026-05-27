import type { TalentKey, VirtueAllocation } from "@/lib/game/character"

import { NarrativePair } from "./narrative-pair"
import { TalentsPicker } from "./talents-picker"
import { VirtuesControl } from "./virtues-control"

/**
 * Movement 2 — Ortus (UNN-216). The structured-choice movement between
 * mechanical Corpus (M1) and narrative Animus (M3). Two-column layout at
 * `md:`+ — left column stacks Ancestry, Background, and the Talents picker;
 * right column hosts the Virtues control. Single column on mobile in the
 * same vertical order.
 *
 * Persistence reuses the existing identity-class actions; this component is
 * a thin composer that wires each sub-control to the slice of the row it
 * cares about.
 */
export function OrtusStep({
  characterId,
  ancestryText,
  backgroundText,
  originArchetypeKey,
  gainedTalents,
  allocation,
  identityVersion,
}: {
  characterId: string
  ancestryText: string | null
  backgroundText: string | null
  originArchetypeKey: string | null
  gainedTalents: TalentKey[]
  allocation: VirtueAllocation
  identityVersion: number
}) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-12">
      <div className="flex flex-col gap-5">
        <h2 className="font-heading text-lg font-medium text-foreground">
          History
        </h2>
        <NarrativePair
          characterId={characterId}
          ancestryText={ancestryText}
          backgroundText={backgroundText}
          identityVersion={identityVersion}
        />
        <TalentsPicker
          characterId={characterId}
          identityVersion={identityVersion}
          originArchetypeKey={originArchetypeKey}
          gainedTalents={gainedTalents}
        />
      </div>

      <VirtuesControl
        characterId={characterId}
        allocation={allocation}
        identityVersion={identityVersion}
      />
    </div>
  )
}
