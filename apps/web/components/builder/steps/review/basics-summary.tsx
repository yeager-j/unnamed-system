import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

import { DRAFT_NAME_PLACEHOLDER } from "@/lib/db/start-character-draft"

import { ReviewCard } from "./shared"

/**
 * Step 1 review block — portrait, name, pronouns. The portrait falls back to
 * the same initials avatar the live sheet renders so the review reads like a
 * preview of the post-finalize state.
 */
export function BasicsSummary({
  shortId,
  name,
  pronouns,
  portraitUrl,
}: {
  shortId: string
  name: string
  pronouns: string | null
  portraitUrl: string | null
}) {
  const trimmed = name.trim()
  const isUnnamed = trimmed.length === 0 || trimmed === DRAFT_NAME_PLACEHOLDER
  const showName = isUnnamed ? "(unnamed)" : trimmed

  return (
    <ReviewCard title="Basics" editStepSlug="basic-info" shortId={shortId}>
      <div className="flex items-start gap-4">
        <Avatar className="size-16 rounded-none">
          <AvatarImage
            src={portraitUrl ?? undefined}
            alt={`${showName}'s portrait`}
            className="rounded-none"
          />
          <AvatarFallback className="rounded-none">
            {isUnnamed ? "?" : initials(trimmed)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-heading text-xl leading-tight font-semibold">
            {showName}
          </p>
          {pronouns ? (
            <p className="text-sm text-muted-foreground">{pronouns}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No pronouns set
            </p>
          )}
        </div>
      </div>
    </ReviewCard>
  )
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join("") || "?"
  )
}
