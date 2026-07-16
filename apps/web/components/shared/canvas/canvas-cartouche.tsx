"use client"

import { Panel } from "@xyflow/react"

/**
 * The dungeon/map name plate (Dungeon Visual Overhaul §D8) — a React Flow
 * {@link Panel} pinned **top-center**, `pointer-events-none` so it never eats a
 * canvas gesture. `font-display` (DM Serif Display) title flanked by gold hairline
 * flourishes, over an uppercase tracked subtitle.
 *
 * The **title** is timeless identity — the dungeon name (DM console + watch) or the
 * map name (editor). The **subtitle** is the surface's headline stat: the delve's
 * turn on the DM console (the count moved off the working bar), the zone count in the
 * editor, and nothing on the watch (its payload holds only *revealed* zones, so a
 * count would lie or leak). Tier never appears here — it lives in the zoom cluster.
 */
export function CanvasCartouche({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <Panel
      position="top-center"
      className="pointer-events-none mt-4 flex flex-col items-center text-center"
    >
      <div className="flex items-center gap-3.5">
        <span className="h-px w-11 bg-gradient-to-r from-transparent to-gold/90" />
        <span className="font-display text-2xl leading-none tracking-wide text-foreground">
          {title}
        </span>
        <span className="h-px w-11 bg-gradient-to-l from-transparent to-gold/90" />
      </div>
      {subtitle ? (
        <span className="mt-1.5 text-sm font-black tracking-[0.16em] text-muted-foreground uppercase">
          {subtitle}
        </span>
      ) : null}
    </Panel>
  )
}
