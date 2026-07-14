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
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view"
import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
} from "@floating-ui/dom"
import { PlusIcon } from "@phosphor-icons/react/dist/ssr"
import { useLayoutEffect, useRef, useState } from "react"
import { createRoot, type Root } from "react-dom/client"

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import { cn } from "@workspace/ui/lib/utils"

import { PARTICIPANT_KIND_ICONS } from "@/components/shared/participant-kind-icons"
import type { LinkerIconKey } from "@/domain/planner/view/linker"

export interface ParticipantCompletionPresentation {
  iconKey: LinkerIconKey
  kind: "option" | "mint"
}

const completionPresentations = new WeakMap<
  Completion,
  ParticipantCompletionPresentation
>()

/** Associates app-owned visuals with a CodeMirror-owned completion row. */
export function registerParticipantCompletion(
  completion: Completion,
  presentation: ParticipantCompletionPresentation
): void {
  completionPresentations.set(completion, presentation)
}

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
    this.root.unmount()
    this.container.remove()
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
}: {
  view: EditorView
  completions: readonly Completion[]
  selectedIndex: number
  anchor: () => DOMRect | null
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null
  )
  const rows = completions.map((completion, index) => ({
    completion,
    index,
    presentation:
      completionPresentations.get(completion) ?? inferPresentation(completion),
  }))
  const optionRows = rows.filter((row) => row.presentation.kind === "option")
  const mintRows = rows.filter((row) => row.presentation.kind === "mint")

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (panel === null) return
    const virtual = {
      getBoundingClientRect: () => anchor() ?? new DOMRect(),
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
  }, [anchor])

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
          {optionRows.length > 0 ? (
            <CommandGroup heading="From the world web">
              {optionRows.map((row) => (
                <CompletionMenuRow key={row.index} view={view} {...row} />
              ))}
            </CommandGroup>
          ) : null}
          {mintRows.length > 0 ? (
            <CommandGroup heading="Create">
              {mintRows.map((row) => (
                <CompletionMenuRow key={row.index} view={view} {...row} />
              ))}
            </CommandGroup>
          ) : null}
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
  presentation: ParticipantCompletionPresentation
}) {
  const Icon =
    presentation.kind === "mint"
      ? PlusIcon
      : PARTICIPANT_KIND_ICONS[presentation.iconKey]

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
      <Icon
        aria-hidden
        className={cn(
          presentation.kind === "option" && presentation.iconKey === "npc"
            ? "text-primary-text"
            : "text-muted-foreground"
        )}
      />
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

function inferPresentation(
  completion: Completion
): ParticipantCompletionPresentation {
  const kind = completion.label.startsWith("Create “") ? "mint" : "option"
  return { kind, iconKey: kind === "mint" ? "article" : "character" }
}

function completionValue(index: number): string {
  return `participant-completion-${index}`
}
