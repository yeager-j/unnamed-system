"use client"

import { LockIcon } from "@phosphor-icons/react/dist/ssr"

import { cn } from "@workspace/ui/lib/utils"

import {
  NOTCH,
  type ExitSide,
  type NotchAnchor,
} from "@/domain/map/view/threshold-geometry"
import type { ThresholdState } from "@/domain/map/view/threshold-state"

import styles from "./threshold-notch.module.css"

/**
 * One rim **threshold notch** (UNN-633, §D4) — a void-filled gap cut into a zone's
 * wall, the paired half of an adjacency (or a lone watch stub opening into darkness).
 * Purely **presentational**: it renders in `EdgeLabelRenderer` (or a watch node's own
 * markup) with `pointer-events: none`, because interaction rides the React Flow edge
 * itself (built-in focus / Enter-select / Escape / Delete), not the notch. The notch
 * is world-space, so it scales with zoom via the edge-label transform.
 *
 * Two composable channels ({@link ThresholdState}): the border style carries knowledge
 * (`open` solid / `secret` dashed / `unmapped` dotted at reduced opacity), the padlock
 * glyph carries `locked` on top of any border. Neutral hardware — never gold.
 */
export interface ThresholdNotchProps {
  anchor: NotchAnchor
  state: ThresholdState
  /** Lit alongside its partner on hover/focus/selection (§D4 pairing legibility). */
  highlighted?: boolean
  /** The zone across the threshold — the tier-gated "⇢ Name" tag. Omit for stubs. */
  partnerName?: string
  /** The direction the partner tag + arrow point. Defaults to the notch's own wall
   *  (`anchor.side`) — correct for a lone stub opening into darkness. A paired notch
   *  passes the direction toward its partner's notch instead, which handles zones that
   *  overlap (where the wall normal points away from the partner). */
  outward?: ExitSide
  /** Standalone (watch stub) accessibility: renders `role="img"` + this label. When
   *  omitted the notch is `aria-hidden` (the parent edge carries the label). */
  ariaLabel?: string
}

/** Just above a selected node's `elevateNodesOnSelect` z-index (1000), so a notch
 *  never falls behind the card whose wall it cuts. */
const NOTCH_Z = 1001

const OUTWARD_ARROW: Record<ExitSide, string> = {
  n: "⇡",
  s: "⇣",
  e: "⇢",
  w: "⇠",
}

export function ThresholdNotch({
  anchor,
  state,
  highlighted,
  partnerName,
  outward = anchor.side,
  ariaLabel,
}: ThresholdNotchProps) {
  const vertical = anchor.orient === "v"
  const w = vertical ? NOTCH.across : NOTCH.along
  const h = vertical ? NOTCH.along : NOTCH.across

  const borderStyle =
    state.border === "secret"
      ? "dashed"
      : state.border === "unmapped"
        ? "dotted"
        : "solid"
  const dim = state.border === "unmapped" ? 0.5 : 1

  // The partner tag sits just outside the notch, on the partner's side.
  const tagGap = NOTCH.along
  const tagTransform =
    outward === "n"
      ? `translate(-50%, -100%) translate(0, -${tagGap}px)`
      : outward === "s"
        ? `translate(-50%, 0) translate(0, ${tagGap}px)`
        : outward === "w"
          ? `translate(-100%, -50%) translate(-${tagGap}px, 0)`
          : `translate(0, -50%) translate(${tagGap}px, 0)`

  return (
    <div
      className="absolute"
      style={{
        transform: `translate(-50%, -50%) translate(${anchor.x}px, ${anchor.y}px)`,
        // A notch is a gap cut *into* the wall, so it must paint on top of the cards.
        // React Flow's edge-label layer sits *below* the node layer in the DOM, and a
        // selected node elevates to z-index 1000 (elevateNodesOnSelect) — so the notch
        // sits just above that. The label layer is z-auto, so this competes at the
        // viewport level against the node z-indices directly.
        zIndex: NOTCH_Z,
      }}
      {...(ariaLabel
        ? { role: "img", "aria-label": ariaLabel }
        : { "aria-hidden": true })}
    >
      <div
        style={{
          width: w,
          height: h,
          background: "var(--void)",
          borderStyle,
          borderWidth: 1.5,
          borderColor: highlighted
            ? "var(--foreground)"
            : "var(--muted-foreground)",
          opacity: dim,
        }}
        className="relative flex items-center justify-center"
      >
        {state.locked ? (
          <LockIcon
            weight="fill"
            aria-hidden
            style={{ color: "var(--muted-foreground)" }}
            className="size-2.5"
          />
        ) : null}
      </div>

      {partnerName ? (
        <span
          aria-hidden
          className={cn(
            styles.label,
            highlighted && styles.lit,
            "pointer-events-none absolute top-0 left-0 flex items-center gap-0.5 text-[10px] whitespace-nowrap text-muted-foreground"
          )}
          style={{ transform: tagTransform }}
        >
          {outward ? OUTWARD_ARROW[outward] : "⇢"} {partnerName}
        </span>
      ) : null}
    </div>
  )
}
