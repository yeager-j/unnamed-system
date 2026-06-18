"use client"

import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

/**
 * The floating top-left control panel shared by the canvas surfaces — the Map
 * editor's settings panel ({@link import("@/components/maps/map-settings-panel").MapSettingsPanel})
 * and the dungeon run console's status panel ({@link import("@/components/dungeon/dungeon-status-panel").DungeonStatusPanel}).
 * Standardizes the card (width, square corners, border, shadow) and the header row
 * — a back-arrow link, the heading title, and a trailing `actions` slot (the
 * editor's collapse caret; the console's LIVE badge) — so the two panels can't
 * drift in size. Body `children` render below the header (the editor's collapsible
 * settings; the console passes none).
 */
export function CanvasPanel({
  backHref,
  backLabel,
  title,
  actions,
  children,
  className,
}: {
  backHref: string
  backLabel: string
  title: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-none border bg-popover shadow-lg",
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={backLabel}
          nativeButton={false}
          render={<Link href={backHref} />}
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-heading text-base font-semibold">
          {title}
        </h1>
        {actions}
      </div>
      {children}
    </div>
  )
}
