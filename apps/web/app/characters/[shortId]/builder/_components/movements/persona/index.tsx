import { FinalizeButton } from "./finalize-button"
import { NameField } from "./name-field"
import { PortraitArea } from "./portrait-area"
import { PronounsField } from "./pronouns-field"

/**
 * Movement 4 — Persona (UNN-218). The commit moment of the builder: the
 * player gives the character a portrait, pronouns, and a name, then clicks
 * Finalize to flip `status: draft` → `finalized` and land on the editable
 * sheet.
 *
 * Vertical centered composition per ADR-002 §"Movement 4 — The Person":
 * portrait at the top, pronouns small below, name as the visual climax in
 * serif. No mini-review, no recap of earlier choices — the page IS the
 * naming moment. The sub-controls read their slice of the draft from
 * `useBuilderDraft()` (UNN-252); `canFinalize`/`disabledReason` are computed
 * by the route page so this stays a Server Component. (Making it a client
 * component to compute the gate from context shifted base-ui's `useId`
 * numbering for the fields below and produced a hydration mismatch.)
 */
export function PersonaStep({
  canFinalize,
  disabledReason,
}: {
  canFinalize: boolean
  disabledReason?: string
}) {
  return (
    <div className="flex flex-col items-center gap-10 py-8">
      <PortraitArea />

      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <NameField />
        <PronounsField />
      </div>

      <FinalizeButton
        canFinalize={canFinalize}
        disabledReason={disabledReason}
      />
    </div>
  )
}
