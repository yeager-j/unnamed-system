"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import { Prose } from "@/components/shared/prose"
import { useCharacter } from "@/hooks/use-character"

/**
 * Read-only Identity block on the Explore tab's story column (PRD §6.1;
 * redesigned UNN-172). Personality Traits leads full-width; Hopes, Dreams,
 * Fears, and Secrets fill a two-column facet grid below it (Secrets sitting
 * beside Fears). The five fields are co-equal free-Markdown regions (UNN-208)
 * of any length, each passed through {@link Prose}. Empty facets render one
 * muted "None recorded." line rather than disappearing, so the block reads the
 * same shape on every character.
 */
export function Identity() {
  const character = useCharacter()
  const facets: ReadonlyArray<{
    label: string
    body: string | null
    className?: string
  }> = [
    {
      label: "Personality Traits",
      body: character.personalityTraits,
      className: "sm:col-span-2",
    },
    { label: "Hopes", body: character.hopes },
    { label: "Dreams", body: character.dreams },
    { label: "Fears", body: character.fears },
    { label: "Secrets", body: character.secrets },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-x-7 gap-y-5 sm:grid-cols-2">
          {facets.map(({ label, body, className }) => (
            <IdentityFacet
              key={label}
              label={label}
              body={body}
              className={className}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function IdentityFacet({
  label,
  body,
  className,
}: {
  label: string
  body: string | null
  className?: string
}) {
  const trimmed = body?.trim() ?? ""
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      {trimmed.length === 0 ? (
        <p className="text-sm text-muted-foreground">None recorded.</p>
      ) : (
        <Prose className="text-sm prose-p:my-0">{trimmed}</Prose>
      )}
    </div>
  )
}
