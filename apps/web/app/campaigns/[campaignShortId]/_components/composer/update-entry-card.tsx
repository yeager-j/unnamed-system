"use client"

import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { ParticipantPill } from "@/components/shared/participant-pill"
import type { ParticipantKind } from "@/domain/planner/participant"

/** One pill on the card's concern strip. */
export interface EntryCardPill {
  kind: ParticipantKind
  id: string
  label: string
  tombstoned?: boolean
}

/**
 * A recorded update's **card** — one presentational shape for every surface
 * that shows a `campaignUpdate` row (the downtime workspace's recorded
 * entry, the entity pages' timelines, phase 7's Chronicle): a context badge,
 * the prose, the concern pills, and optional edit/delete affordances the
 * owning surface wires to the shared actions.
 */
export function UpdateEntryCard({
  badgeLabel,
  body,
  isIdle = false,
  pills,
  onEdit,
  onDelete,
}: {
  badgeLabel: string
  body: string
  /** Idle entries render the "did nothing substantial" fallback muted. */
  isIdle?: boolean
  pills: EntryCardPill[]
  onEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {badgeLabel}
        </Badge>
        {onEdit || onDelete ? (
          <div className="ml-auto flex items-center gap-0.5">
            {onEdit ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Edit entry"
                className="text-muted-foreground"
                onClick={onEdit}
              >
                <PencilSimpleIcon />
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete entry"
                className="text-muted-foreground"
                onClick={onDelete}
              >
                <TrashIcon />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-2 text-sm whitespace-pre-wrap",
          isIdle && body.trim() === ""
            ? "text-muted-foreground italic"
            : "text-foreground"
        )}
      >
        {body.trim() === "" && isIdle ? "Did nothing substantial." : body}
      </p>
      {pills.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {pills.map((pill) => (
            <ParticipantPill
              key={`${pill.kind}:${pill.id}`}
              kind={pill.kind}
              label={pill.label}
              tombstoned={pill.tombstoned ?? false}
              className="text-xs"
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
