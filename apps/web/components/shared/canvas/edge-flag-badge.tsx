"use client"

import { EyeSlashIcon, LockIcon } from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@workspace/ui/components/badge"

/**
 * The read-only flag pill that floats at a connection edge's midpoint, encoding —
 * **without relying on color** (PRD a11y) — what players currently see: an
 * eye-off glyph + "Hidden" when the connection is hidden from players, a lock glyph
 * + "Locked" when it is locked. Each flag is a {@link Badge}. Shared by the Map
 * editor's {@link import("@/components/maps/canvas/connection-edge").ConnectionEdge}
 * and the dungeon console's {@link import("@/components/dungeon/canvas/dungeon-connection-edge").DungeonConnectionEdge}
 * so the DM's two views of the same flags can't drift. Place it inside an
 * `EdgeLabelRenderer`; `labelX`/`labelY` are the edge midpoint from the
 * floating-edge geometry.
 */
export function EdgeFlagBadge({
  labelX,
  labelY,
  hidden,
  locked,
}: {
  labelX: number
  labelY: number
  hidden: boolean
  locked: boolean
}) {
  return (
    <div
      style={{
        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
      }}
      className="pointer-events-none absolute flex items-center gap-1"
    >
      {hidden && (
        <Badge
          variant="outline"
          className="bg-background text-muted-foreground italic shadow-sm"
        >
          <EyeSlashIcon aria-hidden />
          Hidden
        </Badge>
      )}
      {locked && (
        <Badge
          variant="outline"
          className="bg-background text-muted-foreground shadow-sm"
        >
          <LockIcon aria-hidden />
          Locked
        </Badge>
      )}
    </div>
  )
}
