"use client"

import {
  acceptCompletion,
  completionStatus,
  currentCompletions,
  selectedCompletionIndex,
  setSelectedCompletion,
  type Completion,
} from "@codemirror/autocomplete"
import type { Extension } from "@codemirror/state"
import {
  ViewPlugin,
  type EditorView,
  type Rect,
  type ViewUpdate,
} from "@codemirror/view"
import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
} from "@floating-ui/dom"
import { useLayoutEffect, useRef, useState } from "react"
import { createRoot, type Root } from "react-dom/client"

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import { cn } from "@workspace/ui/lib/utils"

import {
  completionPresentationOf,
  type CompletionPresentation,
} from "@/components/editor/completion-presentation"

/** Mirrors CodeMirror's public completion state into a caret-anchored React view. */
export function participantLinkCompletionMenu(): Extension {
  return ViewPlugin.define((view) => new ParticipantCompletionMenuBridge(view))
}

class ParticipantCompletionMenuBridge {
  private readonly container = document.createElement("div")
  private readonly root: Root
  private readonly anchor = () =>
    this.view.coordsAtPos(this.view.state.selection.main.head)

  constructor(private readonly view: EditorView) {
    this.container.dataset.participantCompletionRoot = ""
    document.body.append(this.container)
    this.root = createRoot(this.container)
    this.render()
  }

  update(_update: ViewUpdate): void {
    this.render()
  }

  destroy(): void {
    queueMicrotask(() => {
      this.root.unmount()
      this.container.remove()
    })
  }

  private render(): void {
    const completions = currentCompletions(this.view.state)
    const active = completionStatus(this.view.state) === "active"

    this.root.render(
      active && completions.length > 0 ? (
        <ParticipantCompletionMenu
          view={this.view}
          completions={completions}
          selectedIndex={selectedCompletionIndex(this.view.state) ?? 0}
          anchor={this.anchor}
          anchorPosition={this.view.state.selection.main.head}
        />
      ) : null
    )
  }
}

function ParticipantCompletionMenu({
  view,
  completions,
  selectedIndex,
  anchor,
  anchorPosition,
}: {
  view: EditorView
  completions: readonly Completion[]
  selectedIndex: number
  anchor: () => Rect | null
  anchorPosition: number
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null
  )
  const groups = groupRowsBySection(completions)

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (panel === null) return
    const virtual = {
      getBoundingClientRect: () => floatingRectOf(anchor()),
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
  }, [anchor, anchorPosition])

  return (
    <div
      ref={panelRef}
      data-participant-completion-menu
      aria-hidden="true"
      style={{
        position: "fixed",
        top: position?.y ?? 0,
        left: position?.x ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
      className="z-50 w-80 overflow-hidden rounded-xl shadow-md ring-1 ring-foreground/10"
    >
      <Command shouldFilter={false} value={completionValue(selectedIndex)}>
        <CommandList>
          {groups.map((group) => (
            <CommandGroup
              key={`${group.rows[0]!.index}-${group.name ?? ""}`}
              heading={group.name ?? undefined}
            >
              {group.rows.map((row) => (
                <CompletionMenuRow key={row.index} view={view} {...row} />
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>
  )
}

function CompletionMenuRow({
  view,
  completion,
  index,
  presentation,
}: {
  view: EditorView
  completion: Completion
  index: number
  presentation: CompletionPresentation | null
}) {
  const Icon = presentation?.icon

  function select() {
    view.dispatch({ effects: setSelectedCompletion(index) })
  }

  return (
    <CommandItem
      forceMount
      value={completionValue(index)}
      data-participant-completion-index={index}
      onMouseEnter={select}
      onMouseDown={(event) => {
        event.preventDefault()
        select()
        queueMicrotask(() => {
          acceptCompletion(view)
          view.focus()
        })
      }}
    >
      {Icon ? (
        <Icon
          aria-hidden
          className={cn(
            presentation?.emphasized
              ? "text-primary-text"
              : "text-muted-foreground"
          )}
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate font-medium">
        {completion.label}
      </span>
      {completion.detail ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {completion.detail}
        </span>
      ) : null}
    </CommandItem>
  )
}

interface CompletionMenuGroup {
  name: string | null
  rows: {
    completion: Completion
    index: number
    presentation: CompletionPresentation | null
  }[]
}

/**
 * Groups rows by their CM6 section, mirroring how the native tooltip renders:
 * `sortOptions` already places same-section options contiguously, so a single
 * pass that breaks on section-name change preserves both the grouping and the
 * `currentCompletions` indices the selection mirroring depends on.
 */
function groupRowsBySection(
  completions: readonly Completion[]
): CompletionMenuGroup[] {
  const groups: CompletionMenuGroup[] = []
  for (const [index, completion] of completions.entries()) {
    const name = sectionNameOf(completion)
    const row = {
      completion,
      index,
      presentation: completionPresentationOf(completion),
    }
    const current = groups[groups.length - 1]
    if (current && current.name === name) current.rows.push(row)
    else groups.push({ name, rows: [row] })
  }
  return groups
}

function sectionNameOf(completion: Completion): string | null {
  if (completion.section === undefined) return null
  return typeof completion.section === "string"
    ? completion.section
    : completion.section.name
}

function completionValue(index: number): string {
  return `participant-completion-${index}`
}

function floatingRectOf(rect: Rect | null): DOMRect {
  if (rect === null) return new DOMRect()
  return new DOMRect(
    rect.left,
    rect.top,
    rect.right - rect.left,
    rect.bottom - rect.top
  )
}
