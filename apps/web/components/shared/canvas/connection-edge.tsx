"use client"

import {
  EyeIcon,
  EyeSlashIcon,
  LockIcon,
  LockSimpleOpenIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr"
import {
  BaseEdge,
  EdgeLabelRenderer,
  useStore,
  type EdgeProps,
} from "@xyflow/react"

import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"

import { thresholdStateOf } from "@/domain/map/view/threshold-state"

import type { ConnectionEdge as ConnectionEdgeType } from "./geometry-to-flow"
import { useNotchHighlight } from "./hovered-connection-context"
import { useMapCanvas } from "./map-canvas-context"
import { straightPath } from "./threshold-geometry-path"
import { ThresholdNotchPair } from "./threshold-notch-pair"
import { useThresholdAnchors } from "./use-threshold-anchors"

/**
 * A connection rendered as a **rim-threshold** edge (UNN-633, §D4) — the P2 successor
 * to the drawn step-path. The connection stays a real React Flow edge (connect-by-drag
 * + live drag-update come free, and RF's edge a11y gives Tab-focus / Enter-select /
 * Escape / Delete for free); only the skin changes. The `<BaseEdge>` path is rendered
 * **transparent** (so no line is ever drawn — AC 1) purely to keep the edge's
 * interaction surface, its `interactionWidth` counter-scaled by zoom so the hit target
 * never drops below ~44 screen px. The visible mark is the paired notch cut into the
 * two facing walls ({@link ThresholdNotchPair}).
 *
 * The two independent `hidden`/`locked` flags map through {@link thresholdStateOf}
 * (border style + composable padlock, both non-color). Selecting the edge in Edit mode
 * shows the Hidden/Locked/Delete toolbar anchored at the source-side notch.
 */
export function ConnectionEdge({
  id,
  source,
  target,
  data,
  selected,
}: EdgeProps<ConnectionEdgeType>) {
  const { interactivity, setConnectionFlag, deleteConnection } = useMapCanvas()
  const anchors = useThresholdAnchors(source, target)
  const zoom = useStore((s) => s.transform[2])
  const highlighted = useNotchHighlight(id) || (selected ?? false)

  const editable = interactivity === "edit"
  const connection = data?.connection
  const hidden = connection?.hidden ?? false
  const locked = connection?.locked ?? false

  if (!anchors) return null
  const state = thresholdStateOf({ fog: "revealed", hidden, locked })
  const [sourceAnchor] = anchors

  return (
    <>
      <BaseEdge
        id={id}
        path={straightPath(anchors)}
        interactionWidth={Math.max(20, Math.round(44 / zoom))}
        style={{ stroke: "transparent", strokeWidth: 1 }}
      />

      <ThresholdNotchPair
        anchors={anchors}
        state={state}
        highlighted={highlighted}
        names={
          data ? { source: data.fromName, target: data.toName } : undefined
        }
      />

      {editable && selected ? (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${sourceAnchor.x}px, ${sourceAnchor.y}px)`,
              // Above the cards (a selected card is z-index 1000) and its own notch
              // (1001) — the edge-label layer paints below the node layer otherwise,
              // so a card would occlude the toolbar.
              zIndex: 1002,
            }}
            className="nodrag nopan pointer-events-auto absolute flex items-center gap-1 rounded-none border bg-popover p-1 shadow-md"
          >
            <Button
              size="sm"
              variant={hidden ? "secondary" : "ghost"}
              aria-pressed={hidden}
              aria-label={hidden ? "Reveal connection" : "Hide connection"}
              onClick={() => setConnectionFlag(id, "hidden", !hidden)}
            >
              {hidden ? <EyeSlashIcon /> : <EyeIcon />}
              Hidden
            </Button>
            <Button
              size="sm"
              variant={locked ? "secondary" : "ghost"}
              aria-pressed={locked}
              aria-label={locked ? "Unlock connection" : "Lock connection"}
              onClick={() => setConnectionFlag(id, "locked", !locked)}
            >
              {locked ? <LockIcon /> : <LockSimpleOpenIcon />}
              Locked
            </Button>
            <Separator orientation="vertical" className="mx-0.5 h-5" />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete connection"
              onClick={() => deleteConnection(id)}
            >
              <TrashIcon />
            </Button>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
