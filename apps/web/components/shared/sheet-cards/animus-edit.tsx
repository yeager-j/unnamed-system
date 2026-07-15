"use client"

import { PencilSimpleIcon } from "@phosphor-icons/react"
import Link from "next/link"
import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { useViewerRole } from "@/components/shell/viewer-role"
import {
  documentRefToParam,
  type DocumentRef,
} from "@/domain/character/animus/documents"
import { useLoadedCharacter } from "@/domain/entity/use-entity-write"
import { characterAnimusPath } from "@/lib/paths"

/**
 * The owner-only click-to-edit affordance shared by the read-only narrative
 * surfaces (UNN-221). Editing lives entirely in the Animus writer at
 * `/characters/[shortId]/animus`; these cards never edit inline — a section
 * heading (or a beat title) becomes a link that opens the writer straight to
 * that document via `?doc=`.
 *
 * {@link useAnimusEditHref} returns `null` for non-owners (and when a shared
 * card opts out with `enabled: false`, e.g. the dungeon delve column), so the
 * public viewer sees the plain, unlinked section.
 */
export function useAnimusEditHref(
  enabled = true
): (ref: DocumentRef) => string | null {
  const role = useViewerRole()
  const { profile } = useLoadedCharacter()
  const shortId = profile.shortId

  if (!enabled || role !== "owner") return () => null
  return (ref) => characterAnimusPath(shortId, documentRefToParam(ref))
}

/**
 * The owner-only href to open the writer without targeting a specific document
 * (it opens on Backstory) — the entry point for an empty list, where there is
 * no row to deep-link and the owner adds the first entry from the writer's
 * sidebar. `null` for non-owners.
 */
export function useAnimusWriterHref(): string | null {
  const role = useViewerRole()
  const { profile } = useLoadedCharacter()
  if (role !== "owner") return null
  return characterAnimusPath(profile.shortId)
}

/**
 * Wraps a section heading so hovering reveals a pencil and clicking opens the
 * writer at `href`. Render the plain label instead when the href is `null`.
 */
export function SectionEditLink({
  href,
  ariaLabel,
  children,
  className,
}: {
  href: string
  ariaLabel: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn(
        "group/edit inline-flex items-center gap-1.5 rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {children}
      <PencilSimpleIcon
        aria-hidden
        weight="bold"
        className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100"
      />
    </Link>
  )
}

/**
 * A compact standalone edit affordance for a card header (Knives / Chains /
 * Notes) — the entry point when a section has no per-row heading to hang the
 * link on, or is empty.
 */
export function CardEditLink({
  href,
  ariaLabel,
}: {
  href: string
  ariaLabel: string
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PencilSimpleIcon weight="bold" className="size-4" />
    </Link>
  )
}
