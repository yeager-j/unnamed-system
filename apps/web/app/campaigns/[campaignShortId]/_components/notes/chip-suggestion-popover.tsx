"use client"

import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
} from "@floating-ui/dom"
import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import {
  LinkerRowContent,
  mintParticipantRef,
  MintRowContent,
} from "@/app/campaigns/[campaignShortId]/_components/world/participant-linker"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

import type {
  ActiveChipSuggestion,
  ChipSuggestionHandle,
} from "./chip-suggestion"

/** A keyboard-addressable row: a world-web option or one of the two mint rows. */
type SuggestionRow =
  | { kind: "option"; option: ActiveChipSuggestion["items"][number] }
  | { kind: "mint"; mintKind: "npc" | "article" }

/**
 * The editor's chip-suggestion popover (D7): a caret-anchored listbox over
 * the same rows as the participant linker — shared `LinkerRowContent` /
 * `MintRowContent` visuals, shared quick-mint flow — but deliberately **not**
 * the linker's chrome. `@tiptap/suggestion` keeps focus in the editor and
 * forwards keys through {@link ChipSuggestionHandle}, which is incompatible
 * with both shadcn `Popover` (wants a trigger + focus ownership) and cmdk
 * (wants its own input); a plain `role="listbox"` panel positioned by
 * floating-ui against the caret rect is the honest shape.
 *
 * Mount once per editor and pass the same `handle` ref to
 * `createChipSuggestionExtensions` — the plugins drive this component
 * through it.
 */
export function ChipSuggestionPopover({
  campaignId,
  handle,
}: {
  campaignId: string
  handle: React.RefObject<ChipSuggestionHandle | null>
}) {
  const [session, setSession] = useState<ActiveChipSuggestion | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null
  )
  const [isPending, startTransition] = useTransition()
  const panelRef = useRef<HTMLDivElement | null>(null)

  const rows: SuggestionRow[] = session ? rowsOf(session) : []

  // The plugins call the handle from ProseMirror event code; refs keep the
  // handlers reading this render's state without re-installing per keystroke.
  const rowsRef = useRef(rows)
  const sessionRef = useRef(session)
  const activeIndexRef = useRef(activeIndex)
  rowsRef.current = rows
  sessionRef.current = session
  activeIndexRef.current = activeIndex

  function pick(row: SuggestionRow) {
    const current = sessionRef.current
    if (!current) return
    if (row.kind === "option") {
      current.command(row.option.ref)
      return
    }
    const name = current.query.trim()
    if (name === "") return
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const ref = await mintParticipantRef(row.mintKind, campaignId, name)
          if (ref === null) {
            toast.error(`Couldn't create ${name}. Try again.`)
            return
          }
          toast.success(`${name} created.`)
          current.command(ref)
        },
        () => toast.error(`Couldn't create ${name}. Try again.`)
      )
    )
  }

  useEffect(() => {
    handle.current = {
      onOpen: (next) => {
        sessionRef.current = next
        rowsRef.current = rowsOf(next)
        activeIndexRef.current = 0
        setSession(next)
        setActiveIndex(0)
      },
      onClose: () => setSession(null),
      onKeyDown: (event) => {
        const current = sessionRef.current
        if (!current) return false
        const count = rowsRef.current.length
        if (event.key === "Escape") {
          setSession(null)
          return true
        }
        if (count === 0) return false
        // The ref advances imperatively (not just at render) so back-to-back
        // key events inside one frame still read the post-arrow index.
        if (event.key === "ArrowDown") {
          activeIndexRef.current = (activeIndexRef.current + 1) % count
          setActiveIndex(activeIndexRef.current)
          return true
        }
        if (event.key === "ArrowUp") {
          activeIndexRef.current = (activeIndexRef.current - 1 + count) % count
          setActiveIndex(activeIndexRef.current)
          return true
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const row = rowsRef.current[activeIndexRef.current]
          if (row) pick(row)
          return true
        }
        return false
      },
    }
    return () => {
      handle.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Anchor to the caret: a floating-ui virtual element over the suggestion's
  // clientRect, re-positioned on scroll/resize while open.
  useEffect(() => {
    const panel = panelRef.current
    const rect = session?.clientRect
    if (!panel || !rect) return
    const virtual = {
      getBoundingClientRect: () => rect() ?? new DOMRect(),
    }
    const update = () => {
      void computePosition(virtual, panel, {
        strategy: "fixed",
        placement: "bottom-start",
        middleware: [offset(4), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => setPosition({ x, y }))
    }
    update()
    return autoUpdate(virtual, panel, update)
  }, [session])

  if (session === null || rows.length === 0) return null

  return createPortal(
    <div
      ref={panelRef}
      role="listbox"
      aria-label="Link a participant"
      style={{
        position: "fixed",
        top: position?.y ?? 0,
        left: position?.x ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
      className="z-50 w-80 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {rows.map((row, index) => (
        <div
          key={rowKey(row)}
          role="option"
          aria-selected={index === activeIndex}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseDown={(event) => {
            // The editor must keep focus and its selection — a click must not
            // blur the contenteditable before the command runs.
            event.preventDefault()
            if (!isPending) pick(row)
          }}
          className={cn(
            "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm select-none",
            index === activeIndex && "bg-accent text-accent-foreground",
            isPending && row.kind === "mint" && "opacity-50"
          )}
        >
          {row.kind === "option" ? (
            <LinkerRowContent option={row.option} />
          ) : (
            <MintRowContent kind={row.mintKind} query={session.query.trim()} />
          )}
        </div>
      ))}
    </div>,
    document.body
  )
}

function rowsOf(session: ActiveChipSuggestion): SuggestionRow[] {
  const optionRows = session.items.map(
    (option): SuggestionRow => ({ kind: "option", option })
  )
  if (session.query.trim() === "") return optionRows
  return [
    ...optionRows,
    { kind: "mint", mintKind: "npc" },
    { kind: "mint", mintKind: "article" },
  ]
}

function rowKey(row: SuggestionRow): string {
  return row.kind === "option"
    ? `${row.option.ref.kind}:${row.option.ref.id}`
    : `mint:${row.mintKind}`
}
