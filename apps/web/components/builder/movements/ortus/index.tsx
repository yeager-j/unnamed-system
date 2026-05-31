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
 * Persistence reuses the existing identity-class actions; each sub-control
 * reads the slice of the draft it cares about from `useBuilderDraft()`
 * (UNN-252).
 */
export function OrtusStep() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-12">
      <div className="flex flex-col gap-5">
        <h2 className="font-heading text-lg font-medium text-foreground">
          History
        </h2>
        <NarrativePair />
        <TalentsPicker />
      </div>

      <VirtuesControl />
    </div>
  )
}
