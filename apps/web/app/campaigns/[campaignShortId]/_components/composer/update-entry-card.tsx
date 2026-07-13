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
 * entry, the shared timeline's entries — entity pages, Day-End Capture, the
 * Chronicle): a context badge, the prose, the concern pills, and optional
 * edit/delete affordances the owning surface wires to the shared actions.
 * `chrome="bare"` drops the border for the timeline's gutter rows; `chip`
 * leads with the primary-participant pill, `flag` renders the ⚑ marker
 * badge, and `menu` mounts the surface's overflow (re-date / bind).
 */
export function UpdateEntryCard({
  badgeLabel,
  body,
  isIdle = false,
  pills,
  pillsLabel,
  chip,
  flag,
  menu,
  chrome = "card",
  onEdit,
  onDelete,
}: {
  badgeLabel: string
  body: string
  /** Idle entries render the "did nothing substantial" fallback muted. */
  isIdle?: boolean
  pills: EntryCardPill[]
  /** Optional kicker before the pill strip (the handoff's "CONCERNS"). */
  pillsLabel?: string
  /** The primary-participant chip, rendered ahead of the badge. */
  chip?: React.ReactNode
  /** The ⚑ marker badge, rendered after the context badge. */
  flag?: React.ReactNode
  /** Surface-owned overflow menu, rendered after edit/delete. */
  menu?: React.ReactNode
  /** `card` = bordered (workspace); `bare` = the timeline's gutter row. */
  chrome?: "card" | "bare"
  onEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <div className={cn(chrome === "card" && "rounded-lg border p-4")}>
      <div className="flex items-center gap-2">
        {chip}
        <Badge variant="outline" className="text-xs">
          {badgeLabel}
        </Badge>
        {flag}
        {onEdit || onDelete || menu ? (
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
            {menu}
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
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {pillsLabel ? (
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {pillsLabel}
            </span>
          ) : null}
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
