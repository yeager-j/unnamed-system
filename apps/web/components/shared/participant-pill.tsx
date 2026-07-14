import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { PARTICIPANT_KIND_ICONS } from "@/components/shared/participant-kind-icons"
import type { ParticipantKind } from "@/domain/planner/participant"

/**
 * The participant **pill** (the handoff's `.elink`): one presentational
 * embodiment of a `{kind, id}` ref — NPCs in the primary indigo tint,
 * articles/characters muted, tombstones dimmed. Shared by the editor chip's
 * node view, the read-only chip-prose renderer, and the beat card's chip row
 * (D7: one grammar, one look). Em-sized so it tracks the surrounding text.
 */
export function participantPillClass(
  kind: ParticipantKind,
  tombstoned = false
): string {
  return cn(
    "inline-flex max-w-60 items-center gap-1 rounded-full px-2 py-0.5 align-baseline text-[0.85em] font-medium",
    kind === "npc"
      ? "bg-primary/16 text-primary-text"
      : "bg-muted/55 text-foreground",
    tombstoned && "opacity-50"
  )
}

export function ParticipantPill({
  kind,
  label,
  tombstoned = false,
  className,
  ...rest
}: {
  kind: ParticipantKind
  label: string
  tombstoned?: boolean
} & ComponentProps<"span">) {
  const Icon = PARTICIPANT_KIND_ICONS[kind] ?? PARTICIPANT_KIND_ICONS.article
  return (
    <span
      className={cn(participantPillClass(kind, tombstoned), className)}
      {...rest}
    >
      <Icon aria-hidden className="size-[1em] shrink-0" />
      <span className="truncate">{label || "Unknown"}</span>
    </span>
  )
}
