import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

import { PARTICIPANT_KIND_ICONS } from "@/components/shared/participant-kind-icons"
import { PARTICIPANT_KIND_LABELS } from "@/domain/labels"
import type { ParticipantKind } from "@/domain/planner/participant"
import type { ParticipantPreviewState } from "@/domain/planner/use-participant-preview"

/**
 * The chip pill's **hover card** (UNN-622): portrait, kind, name, traits line,
 * tombstone state. One component, both halves — the display path's
 * `ParticipantPreviewPill` and the editor's CM6 hover bridge render this same
 * card, so a pill previews identically wherever it is written.
 *
 * `label`/`tombstoned` are the caller's **live** resolution and win over the
 * fetched payload's, which is why a cached preview can never show a stale name
 * after a rename. They are optional because the editor has no live resolution
 * for a chip whose ref has left the world web; there, the (`deletedAt`-blind)
 * payload supplies the identity and the tombstone.
 *
 * Deliberately **non-interactive**: nothing in it is reachable only by hover —
 * clicking the pill still opens the subject, which is what keyboard and touch
 * users do.
 */
export function ParticipantPreviewCard({
  kind,
  label,
  tombstoned,
  state,
}: {
  kind: ParticipantKind
  label?: string
  tombstoned?: boolean
  state: ParticipantPreviewState
}) {
  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    )
  }

  const preview = state.status === "ready" ? state.preview : null
  const name = label ?? preview?.name
  const isTombstoned = tombstoned ?? preview?.tombstoned ?? false
  const Icon = PARTICIPANT_KIND_ICONS[kind]

  return (
    <div className={cn("flex flex-col gap-2", isTombstoned && "opacity-60")}>
      <div className="flex items-center gap-3">
        {preview?.portraitUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded portrait, not a static asset
          <img
            src={preview.portraitUrl}
            alt=""
            className="size-10 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-md",
              kind === "npc"
                ? "bg-primary/16 text-primary-text"
                : "bg-muted text-muted-foreground"
            )}
          >
            <Icon aria-hidden className="size-5" />
          </span>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">
            {name ?? "Unknown participant"}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {preview === null
              ? "No longer in this campaign"
              : (preview.sublabel ?? PARTICIPANT_KIND_LABELS[kind])}
          </span>
          {isTombstoned ? (
            <span className="text-xs text-muted-foreground italic">
              Deleted — kept for history
            </span>
          ) : null}
        </div>
      </div>

      {preview?.summary ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {preview.summary}
        </p>
      ) : null}
    </div>
  )
}
