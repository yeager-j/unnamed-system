import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

import {
  chronicleSearchParams,
  type ChronicleParams,
} from "@/domain/planner/view/chronicle"
import { campaignChroniclePath } from "@/lib/paths"

const BUCKET_SIZE = 30

/**
 * The Chronicle's **jump rail**: sticky day-range buckets ("Days 31–60"),
 * derived purely from `currentDay` — no extra query. A jump IS the day-slice
 * mechanism: each bucket links to `?day={bucketTop}` (filters preserved), a
 * server-rendered reset of the feed at that bound, so it never fights the
 * appended "Load earlier days" pages. Hidden below `xl` (the filter bar is
 * the fallback) and entirely absent until history spans several buckets.
 */
export function ChronicleJumpRail({
  campaignShortId,
  currentDay,
  params,
}: {
  campaignShortId: string
  currentDay: number
  params: ChronicleParams
}) {
  const bucketCount = Math.ceil(currentDay / BUCKET_SIZE)
  if (bucketCount < 2) return null

  const activeDay = params.startDay ?? currentDay
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const from = index * BUCKET_SIZE + 1
    const to = Math.min((index + 1) * BUCKET_SIZE, currentDay)
    return { from, to }
  }).reverse()

  return (
    <nav
      aria-label="Jump to a stretch of days"
      className="sticky top-20 hidden w-36 shrink-0 flex-col gap-0.5 self-start xl:flex"
    >
      <span className="px-2 pb-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        Jump to
      </span>
      {buckets.map((bucket) => {
        const isNewest = bucket.to === currentDay
        const active = activeDay >= bucket.from && activeDay <= bucket.to
        const href = `${campaignChroniclePath(campaignShortId)}${chronicleSearchParams(
          { ...params, startDay: isNewest ? null : bucket.to }
        )}`
        return (
          <Link
            key={bucket.from}
            href={href}
            className={cn(
              "rounded-md px-2 py-1 font-mono text-xs transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary-text"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {bucket.from === bucket.to
              ? `Day ${bucket.from}`
              : `Days ${bucket.from}–${bucket.to}`}
          </Link>
        )
      })}
    </nav>
  )
}
