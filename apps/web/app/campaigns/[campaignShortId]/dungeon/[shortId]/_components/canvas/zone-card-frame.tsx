"use client"

import { EyeSlashIcon } from "@phosphor-icons/react/dist/ssr"
import type { ReactNode } from "react"

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import { FloatingEdgeHandles } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/floating-edge-handles"

/**
 * The shared shell every DM-side dungeon Zone node renders (UNN-467), so the board
 * reads identically across the exploration, **Setup**, and **combat** phases. Owns
 * the floating-edge handles, the sized {@link Card} (dimmed when unrevealed), the
 * reveal-aware title + optional hidden-from-players glyph, the trailing count, and
 * the Empty / wrap-list shell. Each node supplies its own `toolbar`, its
 * phase-specific `action` (e.g. the combat Engaged badge), and maps its own token
 * type into `children` (the `<li>`s) — no token shape is coupled here.
 */
export function ZoneCardFrame({
  name,
  revealed,
  count,
  ariaLabel,
  toolbar,
  action,
  titleAccessory,
  selected,
  className,
  showHiddenGlyph = true,
  children,
}: {
  name: string
  revealed: boolean
  count: number
  ariaLabel: string
  /** Rendered before the handles (a `NodeToolbar`); absent on the Setup board. */
  toolbar?: ReactNode
  /** Extra header-action content rendered left of the count (the combat Engaged
   *  badge); the count always renders after it. */
  action?: ReactNode
  /** Content rendered after the name in the title row (the combat Enchantment
   *  badge); the name truncates to make room. */
  titleAccessory?: ReactNode
  /** Forwarded to the `Card` so a node can show React Flow's selected styling. */
  selected?: boolean
  /** Extra `Card` classes (cursor, move-target ring, transition). */
  className?: string
  /** Whether the eye-slash glyph shows when unrevealed — Setup dims but omits it. */
  showHiddenGlyph?: boolean
  children: ReactNode
}) {
  return (
    <>
      {toolbar}

      <FloatingEdgeHandles />

      <Card
        size="sm"
        variant={selected ? "gilded" : "default"}
        aria-label={ariaLabel}
        className={cn(
          "min-h-48 w-86 shadow-sm",
          !revealed && "bg-muted/40",
          className
        )}
      >
        <CardHeader>
          <CardTitle
            className={cn(
              "flex items-center gap-1.5 text-base",
              !revealed && "text-muted-foreground"
            )}
          >
            {!revealed && showHiddenGlyph && (
              <EyeSlashIcon
                className="size-4 shrink-0"
                aria-label="Hidden from players"
              />
            )}
            <span className="truncate">{name}</span>
            {titleAccessory}
          </CardTitle>
          <CardAction className="flex items-center gap-1.5">
            {action}
            <span className="text-xs text-muted-foreground tabular-nums">
              {count}
            </span>
          </CardAction>
        </CardHeader>

        <CardContent>
          {count === 0 ? (
            <p className="text-xs text-muted-foreground">Empty</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">{children}</ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
