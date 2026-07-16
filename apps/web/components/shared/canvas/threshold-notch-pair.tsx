"use client"

import { EdgeLabelRenderer } from "@xyflow/react"

import type {
  ExitSide,
  NotchAnchor,
} from "@/domain/map/view/threshold-geometry"
import type { ThresholdState } from "@/domain/map/view/threshold-state"

import { ThresholdNotch } from "./set-piece/threshold-notch"

/**
 * The two notches of one connection (UNN-633, §D4), painted in `EdgeLabelRenderer`
 * (above the node cards, where a wall notch must sit). Shared by the editor and dungeon
 * custom edges so the notch markup isn't duplicated; each edge derives the
 * {@link ThresholdState} and partner names from its own model and hands them here. The
 * notches are presentational — interaction rides the edge itself.
 *
 * `names.source` / `names.target` are the two zone names; the notch on the **source**
 * wall faces the target (so it labels `names.target`), and vice versa.
 */
export interface ThresholdNotchPairProps {
  /** Anchors in source/target order (index 0 on the source zone's wall). */
  anchors: [NotchAnchor, NotchAnchor]
  state: ThresholdState
  highlighted?: boolean
  names?: { source: string; target: string }
}

/** The dominant-axis direction from `from` toward `to` — the way the partner tag
 *  points. Uses the full 2D vector (not the notch's wall axis), so it stays correct
 *  even when the two zones overlap and the wall normal points away from the partner. */
function directionTo(from: NotchAnchor, to: NotchAnchor): ExitSide {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "e" : "w"
  return dy >= 0 ? "s" : "n"
}

export function ThresholdNotchPair({
  anchors,
  state,
  highlighted,
  names,
}: ThresholdNotchPairProps) {
  const [sourceAnchor, targetAnchor] = anchors
  return (
    <EdgeLabelRenderer>
      <ThresholdNotch
        anchor={sourceAnchor}
        state={state}
        highlighted={highlighted}
        partnerName={names?.target}
        outward={directionTo(sourceAnchor, targetAnchor)}
      />
      <ThresholdNotch
        anchor={targetAnchor}
        state={state}
        highlighted={highlighted}
        partnerName={names?.source}
        outward={directionTo(targetAnchor, sourceAnchor)}
      />
    </EdgeLabelRenderer>
  )
}
