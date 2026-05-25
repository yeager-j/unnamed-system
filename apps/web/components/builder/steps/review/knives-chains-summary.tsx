import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"

import { Prose } from "@/components/character-sheet/shared/prose"
import type {
  CharacterChainRow,
  CharacterKnifeRow,
} from "@/lib/db/load-character"

import { NoneRecorded, ReviewCard } from "./shared"

type IdentityEntry = CharacterKnifeRow | CharacterChainRow

/**
 * Review summary for Knives or Chains. Both lists share the same shape so
 * they share one component — pass the title and the rows. Each entry
 * collapses to its title (the rulebook's "stake summary") and expands to
 * the Markdown description, conserving vertical space in the review
 * without hiding the title-level scan-line.
 */
export function KnivesChainsSummary({
  shortId,
  title,
  description,
  entries,
}: {
  shortId: string
  title: string
  description: string
  entries: readonly IdentityEntry[]
}) {
  return (
    <ReviewCard
      title={`${title} (${entries.length})`}
      description={description}
      editStepSlug="character-origins"
      shortId={shortId}
    >
      {entries.length === 0 ? (
        <NoneRecorded />
      ) : (
        <Accordion>
          {entries.map((entry) => {
            const trimmedDescription = entry.description?.trim() ?? ""
            return (
              <AccordionItem key={entry.id} value={entry.id}>
                <AccordionTrigger className="text-sm">
                  <span className="pr-3 font-medium">{entry.title}</span>
                </AccordionTrigger>
                <AccordionContent>
                  {trimmedDescription.length === 0 ? (
                    <p className="text-muted-foreground italic">
                      No description.
                    </p>
                  ) : (
                    <Prose className="prose-p:my-0">{trimmedDescription}</Prose>
                  )}
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}
    </ReviewCard>
  )
}
