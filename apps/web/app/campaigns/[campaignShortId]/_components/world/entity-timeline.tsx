import { ParticipantPill } from "@/components/shared/participant-pill"
import { ACTIVITY_CATEGORY_LABELS } from "@/domain/labels"
import type { EntityTimelineDayView } from "@/domain/planner/view/world-detail"

/**
 * The per-entity timeline (UNN-579, PRD FR-10): every update where this
 * entity is primary or concerned, day-grouped, `(day, authoredAt)` order.
 * Presentational — the page shapes rows via `buildEntityTimelineView`
 * (tombstoned co-participants arrive pre-resolved and render muted; the page
 * never breaks on one).
 */
export function EntityTimeline({ days }: { days: EntityTimelineDayView[] }) {
  if (days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing recorded yet — updates naming this entry gather here.
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-4">
      {days.map((day) => (
        <li key={day.day} className="flex flex-col gap-2">
          <div className="font-mono text-xs text-muted-foreground uppercase">
            Day {day.day}
          </div>
          <ol className="flex flex-col gap-2 border-l pl-4">
            {day.entries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1">
                <p className="text-sm whitespace-pre-wrap">{entry.body}</p>
                {entry.category !== null || entry.others.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {entry.category !== null ? (
                      <span className="rounded-full border px-2 py-0.5">
                        {ACTIVITY_CATEGORY_LABELS[entry.category]}
                      </span>
                    ) : null}
                    {entry.others.map((other) => (
                      <ParticipantPill
                        key={`${other.ref.kind}:${other.ref.id}`}
                        kind={other.ref.kind}
                        label={other.label}
                        tombstoned={other.tombstoned}
                      />
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}
