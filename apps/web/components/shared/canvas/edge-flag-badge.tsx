"use client"

import {
  EyeSlashIcon,
  FootprintsIcon,
  LockIcon,
} from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@workspace/ui/components/badge"

/**
 * The read-only flag pill that floats at a connection edge's midpoint, encoding —
 * **without relying on color** (PRD a11y) — what players currently see: an
 * eye-off glyph + "Hidden" when the connection is a hidden (secret) passage, a
 * footprints glyph + "Undiscovered" when it's an ordinary connection players just
 * haven't reached yet (it auto-surfaces as a silhouette on reveal — only the
 * dungeon console distinguishes this), and a lock glyph + "Locked" when locked.
 * Each flag is a {@link Badge}. Shared by the Map editor's
 * {@link import("@/components/shared/canvas/connection-edge").ConnectionEdge} (which
 * only sets `hidden`/`locked`) and the dungeon console's
 * {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/connection-edge").DungeonConnectionEdge}
 * so the DM's two views of the same flags can't drift. Place it inside an
 * `EdgeLabelRenderer`; `labelX`/`labelY` are the edge midpoint from the
 * floating-edge geometry.
 */
export function EdgeFlagBadge({
  labelX,
  labelY,
  hidden,
  unrevealed = false,
  locked,
}: {
  labelX: number
  labelY: number
  /** A deliberately-hidden (secret) passage. */
  hidden: boolean
  /** An ordinary connection players haven't discovered yet (dungeon-only). */
  unrevealed?: boolean
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
      {unrevealed && (
        <Badge
          variant="outline"
          className="bg-background text-muted-foreground/70 shadow-sm"
        >
          <FootprintsIcon aria-hidden />
          Undiscovered
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
