"use client"

import {
  EyeIcon,
  EyeSlashIcon,
  LockIcon,
  LockSimpleOpenIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr"
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react"

import type { MapConnection } from "@workspace/game/foundation"
import { Button } from "@workspace/ui/components/button"

import { EdgeFlagBadge } from "@/components/shared/canvas/edge-flag-badge"
import { useFloatingEdgePath } from "@/components/shared/canvas/use-floating-edge-path"

import type { ConnectionEdge as ConnectionEdgeType } from "./geometry-to-flow"
import { useMapCanvas } from "./map-canvas-context"

/**
 * A connection rendered as a **floating** React Flow edge (UNN-461) — it attaches
 * to the borders of the two Zones facing each other (see
 * {@link import("@/components/shared/canvas/floating-edge").getEdgeParams}), not to fixed handles, since
 * connections are undirected and spatial. The two independent `hidden`/`locked`
 * flags are encoded **without relying on color** (PRD a11y): `locked` thickens the
 * stroke + shows a lock glyph, `hidden` dashes the stroke + shows an eye-off glyph,
 * and both go into the edge's `aria-label`. Selecting it in edit mode swaps the
 * glyphs for a floating toolbar (toggle each flag / delete).
 */

/** A human description of the connection's flags for the edge's `aria-label`. */
function connectionStateLabel(connection: MapConnection): string {
  const states: string[] = []
  if (connection.hidden) states.push("hidden")
  if (connection.locked) states.push("locked")
  return states.length > 0
    ? `Connection — ${states.join(" and ")}`
    : "Connection"
}

export function ConnectionEdge({
  id,
  source,
  target,
  data,
  selected,
}: EdgeProps<ConnectionEdgeType>) {
  const { interactivity, setConnectionFlag, deleteConnection } = useMapCanvas()
  const geometry = useFloatingEdgePath(source, target)

  const editable = interactivity === "edit"
  const connection = data?.connection
  const hidden = connection?.hidden ?? false
  const locked = connection?.locked ?? false

  if (!geometry) return null
  const { path, labelX, labelY } = geometry

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        aria-label={
          connection ? connectionStateLabel(connection) : "Connection"
        }
        style={{
          strokeWidth: selected ? 3 : locked ? 2.5 : 1.5,
          strokeDasharray: hidden ? "6 4" : undefined,
          stroke: selected ? "var(--ring)" : "var(--muted-foreground)",
        }}
      />

      <EdgeLabelRenderer>
        {editable && selected ? (
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="nodrag nopan pointer-events-auto absolute flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
          >
            <Button
              size="icon-sm"
              variant={hidden ? "secondary" : "ghost"}
              aria-pressed={hidden}
              aria-label={hidden ? "Reveal connection" : "Hide connection"}
              onClick={() => setConnectionFlag(id, "hidden", !hidden)}
            >
              {hidden ? <EyeSlashIcon /> : <EyeIcon />}
            </Button>
            <Button
              size="icon-sm"
              variant={locked ? "secondary" : "ghost"}
              aria-pressed={locked}
              aria-label={locked ? "Unlock connection" : "Lock connection"}
              onClick={() => setConnectionFlag(id, "locked", !locked)}
            >
              {locked ? <LockIcon /> : <LockSimpleOpenIcon />}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete connection"
              onClick={() => deleteConnection(id)}
            >
              <TrashIcon />
            </Button>
          </div>
        ) : (
          (hidden || locked) && (
            <EdgeFlagBadge
              labelX={labelX}
              labelY={labelY}
              hidden={hidden}
              locked={locked}
            />
          )
        )}
      </EdgeLabelRenderer>
    </>
  )
}
