import { Separator } from "@workspace/ui/components/separator"

import { IdentitySection } from "./identity-section"
import { IDENTITY_LIST_ORDER } from "./messages"

/**
 * Step 4 of the builder (PRD §5.1, rulebook 1.5) — the five Identity
 * sections. Each section is one Markdown blob written to its own column
 * on the `character` row; the section components own their own auto-save
 * pipeline.
 *
 * Rendered in PRD order (Personality → Hopes → Dreams → Fears → Secrets)
 * with `<Separator />` between sections so the screen scans like a single
 * sheet of paper. The Next button's gate lives on the route
 * (`app/builder/[shortId]/[step]/page.tsx`).
 */
export function IdentityStep({
  characterId,
  identityVersion,
  personalityTraits,
  hopes,
  dreams,
  fears,
  secrets,
}: {
  characterId: string
  identityVersion: number
  personalityTraits: string | null
  hopes: string | null
  dreams: string | null
  fears: string | null
  secrets: string | null
}) {
  const serverValues = {
    personality: personalityTraits,
    hope: hopes,
    dream: dreams,
    fear: fears,
    secret: secrets,
  }

  return (
    <div className="flex flex-col gap-6">
      {IDENTITY_LIST_ORDER.map((field, index) => (
        <div key={field} className="flex flex-col gap-6">
          {index > 0 ? <Separator /> : null}
          <IdentitySection
            characterId={characterId}
            identityVersion={identityVersion}
            field={field}
            serverValue={serverValues[field]}
          />
        </div>
      ))}
    </div>
  )
}
