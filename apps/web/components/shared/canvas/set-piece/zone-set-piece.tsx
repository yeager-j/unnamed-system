"use client"

import { EyeSlashIcon, NoteIcon } from "@phosphor-icons/react/dist/ssr"
import { useId, type ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import type { ZoneSetPieceView } from "@/domain/map/view/set-piece-view"

import { MotifGlyph } from "./motif-icons"
import { OccupantAvatars, OccupantPips } from "./occupant-chips"
import styles from "./zone-set-piece.module.css"

/**
 * The **one tiered set-piece card** every zone node renders (Dungeon Visual
 * Overhaul §D3) — the single card that replaced the four divergent zone cards.
 * It is engine-free: it renders a presentation-owned {@link ZoneSetPieceView}
 * the `domain/dungeon/view` builders produce, and never names the engine.
 *
 * Three layers — Marquee / Stage / Closeup — stay mounted at `absolute inset-0`;
 * which one shows is a pure CSS crossfade off the `data-tier` the canvas wrapper
 * stamps, so a tier flip is no reflow, no remount, no React state (the footprint
 * is fixed by `size` alone — the card's box never reads zoom, selection, or turn
 * state; PRD AC 4).
 *
 * Accessibility: the card keeps `aria-label="Zone: <name>"` **exactly** — stable,
 * name-only (load-bearing in `dungeon-watch.spec.ts`, and a label that changed with
 * reveal/occupancy would churn on every flip). Reveal + occupancy ride *visible*
 * glyphs/text (the eye-slash, the summary line, "Unoccupied") plus an always-present
 * `aria-describedby` state line — never the label, never color alone.
 *
 * P1b renders identity + tiers + occupant pips/avatars; the interactive Closeup
 * token grid is the `closeupRoster` slot each surface fills (the kit absorbs it
 * with the roster inspector in P1c). D6 color channels (mood wash, occupancy
 * gradient, gold keyline, dashed reveal border) land in P3.
 */
export interface ZoneSetPieceProps {
  view: ZoneSetPieceView
  selected?: boolean
  className?: string
  /** React Flow connection handles (the floating-edge rim handles). */
  handles?: ReactNode
  /** A `NodeToolbar` — rendered outside the layers, so it's tier-independent. */
  toolbar?: ReactNode
  /** Header accessory after the name (the Enchantment badge). */
  titleAccessory?: ReactNode
  /** Header action on the right (the DM combat Enchantment control). */
  headerAction?: ReactNode
  /** The interactive Closeup token grid; the surface wrapper owns propagation. */
  closeupRoster?: ReactNode
  /** Extra Closeup content below the roster (the watch's known-exit silhouettes,
   *  a P1b holdover the P2 threshold notches replace). */
  closeupFooter?: ReactNode
  /** Procedural Dungeons contents reserve, shipped empty. */
  manifestSlot?: ReactNode
}

const UNOCCUPIED = "Unoccupied"

export function ZoneSetPiece({
  view,
  selected,
  className,
  handles,
  toolbar,
  titleAccessory,
  headerAction,
  closeupRoster,
  closeupFooter,
  manifestSlot,
}: ZoneSetPieceProps) {
  const describedById = useId()
  const unmapped = view.reveal === "unmapped"
  const occupied = view.occupants.length > 0
  const dimContent = unmapped && "opacity-50"

  const revealGlyph = unmapped ? (
    <EyeSlashIcon
      className="size-4 shrink-0 text-muted-foreground"
      aria-hidden
    />
  ) : null

  const dmNotesGlyph = view.hasDmNotes ? (
    <NoteIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
  ) : null

  const stateLine = [
    unmapped ? "Hidden from players." : null,
    occupied ? view.summary : UNOCCUPIED + ".",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div
      aria-label={`Zone: ${view.name}`}
      aria-describedby={describedById}
      className={cn(
        "relative size-full border bg-card text-card-foreground shadow-sm transition-shadow",
        selected && "ring-2 ring-gold",
        className
      )}
    >
      {toolbar}
      {handles}

      <span id={describedById} className="sr-only">
        {stateLine}
      </span>

      {/* Marquee — motif + name + faction pips */}
      <div
        className={cn(
          styles.layer,
          styles.marquee,
          "items-center justify-center gap-2 overflow-hidden p-3 text-center",
          dimContent
        )}
      >
        <MotifGlyph
          motif={view.motif}
          className="size-14 text-muted-foreground"
        />
        <span className="line-clamp-2 text-lg font-semibold">{view.name}</span>
        <OccupantPips occupants={view.occupants} />
      </div>

      {/* Stage — header + one-line description + occupancy footer */}
      <div
        className={cn(styles.layer, styles.stage, "gap-2 overflow-hidden p-3")}
      >
        <div className={cn("flex items-center gap-2", dimContent)}>
          {revealGlyph}
          <MotifGlyph
            motif={view.motif}
            className="size-5 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1 truncate text-lg font-semibold">
            {view.name}
          </span>
          {dmNotesGlyph}
          {titleAccessory}
        </div>
        {view.description ? (
          <p
            className={cn(
              "line-clamp-1 text-sm text-muted-foreground italic",
              dimContent
            )}
          >
            {view.description}
          </p>
        ) : null}
        <div className="mt-auto flex flex-col gap-1">
          {occupied ? (
            <>
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {view.summary}
              </span>
              <OccupantAvatars occupants={view.occupants} />
            </>
          ) : (
            <span className="text-sm text-muted-foreground italic">
              {UNOCCUPIED}
            </span>
          )}
        </div>
      </div>

      {/* Closeup — header + fuller description + roster */}
      <div
        className={cn(
          styles.layer,
          styles.closeup,
          "gap-2 overflow-hidden p-3"
        )}
      >
        <div className={cn("flex items-center gap-2", dimContent)}>
          {revealGlyph}
          <MotifGlyph
            motif={view.motif}
            className="size-5 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1 truncate text-base font-semibold">
            {view.name}
          </span>
          {dmNotesGlyph}
          {titleAccessory}
          {headerAction}
        </div>
        {view.description ? (
          <p
            className={cn(
              "line-clamp-3 text-sm text-muted-foreground",
              dimContent
            )}
          >
            {view.description}
          </p>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {closeupRoster ??
            (occupied ? null : (
              <span className="text-sm text-muted-foreground italic">
                {UNOCCUPIED}
              </span>
            ))}
          {closeupFooter}
        </div>
        {manifestSlot}
      </div>
    </div>
  )
}
