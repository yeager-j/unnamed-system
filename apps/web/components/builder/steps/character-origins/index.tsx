import { Separator } from "@workspace/ui/components/separator"

import type {
  CharacterChainRow,
  CharacterKnifeRow,
} from "@/lib/db/load-character"
import type { TalentKey } from "@/lib/game/talents"
import type { VirtueAllocation } from "@/lib/game/virtues/allocation"

import { ChainsEditor } from "./chains-editor"
import { KnivesEditor } from "./knives-editor"
import { NarrativeFields } from "./narrative-fields"
import { TalentsPicker } from "./talents-picker"
import { VirtueAllocationPicker } from "./virtue-allocation"

/**
 * Step 3 of the builder (PRD §5.1) — the screen that grounds the
 * character. Composes the five sub-sections in rulebook order so the
 * player works top-down: Virtues first (validation gate), then the
 * setting-defined slots (Ancestry, Background), the long-form Backstory,
 * the stakes (Knives) and limitations (Chains), and finally the Talents
 * derived from / added to the Origin Archetype.
 *
 * Auto-saves throughout — no "Save" button. The Next button's gate lives
 * on the route (`app/builder/[shortId]/[step]/page.tsx`).
 */
export function CharacterOriginsStep({
  characterId,
  identityVersion,
  serverVirtueAllocation,
  ancestryText,
  backgroundText,
  backstoryText,
  knives,
  chains,
  originArchetypeKey,
  gainedTalents,
}: {
  characterId: string
  identityVersion: number
  serverVirtueAllocation: VirtueAllocation
  ancestryText: string | null
  backgroundText: string | null
  backstoryText: string | null
  knives: CharacterKnifeRow[]
  chains: CharacterChainRow[]
  originArchetypeKey: string | null
  gainedTalents: TalentKey[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <VirtueAllocationPicker
        characterId={characterId}
        identityVersion={identityVersion}
        serverAllocation={serverVirtueAllocation}
      />
      <Separator />
      <TalentsPicker
        characterId={characterId}
        identityVersion={identityVersion}
        originArchetypeKey={originArchetypeKey}
        gainedTalents={gainedTalents}
      />
      <Separator />
      <NarrativeFields
        characterId={characterId}
        identityVersion={identityVersion}
        ancestryText={ancestryText}
        backgroundText={backgroundText}
        backstoryText={backstoryText}
      />
      <Separator />
      <KnivesEditor
        characterId={characterId}
        identityVersion={identityVersion}
        knives={knives}
      />
      <Separator />
      <ChainsEditor
        characterId={characterId}
        identityVersion={identityVersion}
        chains={chains}
      />
    </div>
  )
}
