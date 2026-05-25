import { Prose } from "@/components/character-sheet/shared/prose"

import {
  IDENTITY_TRAIT_MESSAGES,
  IDENTITY_TRAIT_ORDER,
} from "../identity/messages"
import { NoneRecorded, ReviewCard } from "./shared"

/**
 * Review summary for the Step-4 Identity sections. Five short Markdown
 * blobs — Personality / Hopes / Dreams / Fears / Secrets — each rendered
 * inline because a per-section accordion would hide content shorter than
 * the accordion trigger itself.
 */
export function IdentitySummary({
  shortId,
  personalityTraits,
  hopes,
  dreams,
  fears,
  secrets,
}: {
  shortId: string
  personalityTraits: string | null
  hopes: string | null
  dreams: string | null
  fears: string | null
  secrets: string | null
}) {
  const values = {
    personality: personalityTraits,
    hope: hopes,
    dream: dreams,
    fear: fears,
    secret: secrets,
  }

  return (
    <ReviewCard
      title="Identity Traits"
      editStepSlug="identity"
      shortId={shortId}
    >
      <div className="flex flex-col gap-4">
        {IDENTITY_TRAIT_ORDER.map((field) => {
          const trimmed = (values[field] ?? "").trim()
          return (
            <div key={field} className="flex flex-col gap-1">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {IDENTITY_TRAIT_MESSAGES[field].label}
              </h3>
              {trimmed.length === 0 ? (
                <NoneRecorded />
              ) : (
                <Prose className="text-sm prose-p:my-0">{trimmed}</Prose>
              )}
            </div>
          )
        })}
      </div>
    </ReviewCard>
  )
}
