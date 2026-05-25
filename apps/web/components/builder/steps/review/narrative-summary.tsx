import { Prose } from "@/components/character-sheet/shared/prose"

import { NoneRecorded, ReviewCard } from "./shared"

/**
 * Review summary for the three free-text Step-3 narrative fields. Renders the
 * same Markdown through `Prose` the live sheet's Background block uses, so
 * the player previews exactly what they'll see post-finalize. The Backstory
 * section is the only field that can be long; line clamping is intentionally
 * skipped here since the player can already collapse the screen mentally by
 * scrolling — over-engineering an expand toggle for a single-blob field
 * doesn't pay rent.
 */
export function NarrativeSummary({
  shortId,
  ancestryText,
  backgroundText,
  backstoryText,
}: {
  shortId: string
  ancestryText: string | null
  backgroundText: string | null
  backstoryText: string | null
}) {
  const sections: ReadonlyArray<{ label: string; text: string | null }> = [
    { label: "Ancestry", text: ancestryText },
    { label: "Background", text: backgroundText },
    { label: "Backstory", text: backstoryText },
  ]

  return (
    <ReviewCard
      title="Narrative"
      editStepSlug="character-origins"
      shortId={shortId}
    >
      <div className="flex flex-col gap-4">
        {sections.map(({ label, text }) => (
          <NarrativeSection key={label} label={label} text={text} />
        ))}
      </div>
    </ReviewCard>
  )
}

function NarrativeSection({
  label,
  text,
}: {
  label: string
  text: string | null
}) {
  const trimmed = text?.trim() ?? ""
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      {trimmed.length === 0 ? <NoneRecorded /> : <Prose>{trimmed}</Prose>}
    </div>
  )
}
