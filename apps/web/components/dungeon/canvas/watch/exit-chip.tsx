"use client"

import { ArrowSquareOutIcon, LockIcon } from "@phosphor-icons/react/dist/ssr"

/**
 * A known-exit silhouette chip — *that* a passage leaves this Zone toward somewhere
 * undiscovered, and whether it's locked. Non-color-encoded (glyph + text) per the
 * canvas a11y baseline; carries no far-Zone information.
 */
export function ExitChip({ locked }: { locked: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 border border-dashed border-muted-foreground/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {locked ? (
        <LockIcon className="size-3 shrink-0" aria-hidden />
      ) : (
        <ArrowSquareOutIcon className="size-3 shrink-0" aria-hidden />
      )}
      {locked ? "Locked exit" : "Unexplored exit"}
    </span>
  )
}
