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
 * naming moment. `canFinalize` + `disabledReason` come from the route's
 * `findStepGateFailures` so the Finalize button honors every gate (not just
 * persona's name check).
 */
export function PersonaStep({
  characterId,
  name,
  pronouns,
  portraitUrl,
  identityVersion,
  canFinalize,
  disabledReason,
}: {
  characterId: string
  name: string
  pronouns: string | null
  portraitUrl: string | null
  identityVersion: number
  canFinalize: boolean
  disabledReason?: string
}) {
  return (
    <div className="flex flex-col items-center gap-10 py-8">
      <PortraitArea
        characterId={characterId}
        portraitUrl={portraitUrl}
        identityVersion={identityVersion}
      />

      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <PronounsField
          characterId={characterId}
          pronouns={pronouns}
          identityVersion={identityVersion}
        />
        <NameField
          characterId={characterId}
          name={name}
          identityVersion={identityVersion}
        />
      </div>

      <FinalizeButton
        characterId={characterId}
        identityVersion={identityVersion}
        canFinalize={canFinalize}
        disabledReason={disabledReason}
      />
    </div>
  )
}
