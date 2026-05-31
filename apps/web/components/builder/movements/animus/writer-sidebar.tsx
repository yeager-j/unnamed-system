"use client"

import { PlusIcon, TrashIcon } from "@phosphor-icons/react"

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

import { useBuilderDraft, useBuilderWrite } from "@/hooks/use-builder-draft"
import {
  addCharacterChainAction,
  removeCharacterChainAction,
} from "@/lib/actions/character-chains"
import {
  addCharacterKnifeAction,
  removeCharacterKnifeAction,
} from "@/lib/actions/character-knives"

import { BUILDER_STEPS, indexOfStep } from "../../builder-steps"
import { useAnimusDocument } from "./animus-context"
import {
  buildDocumentGroups,
  refsEqual,
  UNTITLED_CHAIN,
  UNTITLED_KNIFE,
  type DocumentGroup,
  type DocumentRef,
} from "./documents"

const ANIMUS_STEP = BUILDER_STEPS[indexOfStep("animus")!]!

/**
 * The Movement 3 writer's left rail. Renders four groups (Backstory /
 * Knives / Chains / Identity Traits) of selectable documents. Active row
 * is highlighted via `SidebarMenuButton`'s `isActive` prop; clicking sets
 * the selection in the `AnimusDocumentContext` so the pane (in the page
 * subtree) swaps.
 *
 * Add (Knives/Chains only) wires through `useBuilderWrite`. On success, the
 * new entry becomes the active document so the player lands ready to type.
 *
 * Remove (Knives/Chains only) reuses the same write hook. If the active
 * document is the one being removed, the selection falls back to Backstory
 * so the pane has something to render.
 */
export function WriterSidebar() {
  const { knives, chains } = useBuilderDraft()
  const groups = buildDocumentGroups({ knives, chains })

  return (
    <>
      <WriterSidebarHeader />
      <SidebarContent>
        {groups.map((group) => (
          <SidebarSection key={group.kind} group={group} />
        ))}
      </SidebarContent>
    </>
  )
}

/**
 * The chapter header (Roman numeral, "Animus", framing line) relocated
 * from `BuilderShell`'s top into the sidebar so the main pane is free for
 * the document. Sidebar-scale type (smaller than the centered chapter
 * heading on Movements 1/2/4) and left-aligned to read as the rail's
 * heading.
 */
function WriterSidebarHeader() {
  return (
    <SidebarHeader className="gap-3 px-4 pt-6 pb-4">
      <span
        aria-hidden
        className="font-mono text-xs text-sidebar-foreground/60 uppercase"
      >
        {ANIMUS_STEP.romanNumeral}
      </span>
      <h1 className="font-heading text-3xl font-medium text-sidebar-foreground">
        {ANIMUS_STEP.label}
      </h1>
      {ANIMUS_STEP.framingLine ? (
        <p className="font-heading text-sm text-sidebar-foreground/70 italic">
          {ANIMUS_STEP.framingLine}
        </p>
      ) : null}
    </SidebarHeader>
  )
}

function SidebarSection({ group }: { group: DocumentGroup }) {
  const { activeRef, selectDocument, resetToDefault } = useAnimusDocument()
  const { pending, write, characterId } = useBuilderWrite()

  const showCount = group.kind === "knives" || group.kind === "chains"
  const showHeading = group.kind !== "backstory"

  function handleAdd() {
    const kind = group.kind
    if (kind !== "knives" && kind !== "chains") return
    const message =
      kind === "knives"
        ? "Couldn't add the Knife. Try again."
        : "Couldn't add the Chain. Try again."
    write({
      surface: kind,
      action: (expectedVersion) =>
        kind === "knives"
          ? addCharacterKnifeAction({ characterId, title: "", expectedVersion })
          : addCharacterChainAction({
              characterId,
              title: "",
              expectedVersion,
            }),
      messages: { stale: message, error: message },
      onSuccess: (value) =>
        selectDocument({
          kind: kind === "knives" ? "knife" : "chain",
          id: value.id,
          label: "",
        }),
    })
  }

  function handleRemove(ref: DocumentRef) {
    if (!group.canRemove) return
    if (ref.kind !== "knife" && ref.kind !== "chain") return

    const wasActive = refsEqual(activeRef, ref)
    const message =
      ref.kind === "knife"
        ? "Couldn't remove the Knife. Try again."
        : "Couldn't remove the Chain. Try again."

    write({
      surface: ref.kind === "knife" ? "knives" : "chains",
      action: (expectedVersion) =>
        ref.kind === "knife"
          ? removeCharacterKnifeAction({
              characterId,
              knifeId: ref.id,
              expectedVersion,
            })
          : removeCharacterChainAction({
              characterId,
              chainId: ref.id,
              expectedVersion,
            }),
      messages: { stale: message, error: message },
      onSuccess: () => {
        if (wasActive) resetToDefault()
      },
    })
  }

  return (
    <SidebarGroup>
      {showHeading ? (
        <SidebarGroupLabel className="flex items-center justify-between text-sidebar-foreground/80 uppercase">
          <span>{group.label}</span>
          {showCount ? (
            <span className="font-mono text-xs tabular-nums">
              {group.entries.length}
            </span>
          ) : null}
        </SidebarGroupLabel>
      ) : null}

      <SidebarGroupContent>
        <SidebarMenu>
          {group.entries.map((entry) => {
            const isPlaceholder = entry.label.length === 0
            const displayedLabel = entry.label || placeholderLabel(entry)
            return (
              <SidebarMenuItem key={`${entry.kind}:${entry.id}`}>
                <SidebarMenuButton
                  isActive={refsEqual(activeRef, entry)}
                  onClick={() => selectDocument(entry)}
                >
                  <span
                    className={
                      isPlaceholder ? "text-sidebar-foreground/50" : undefined
                    }
                  >
                    {displayedLabel}
                  </span>
                </SidebarMenuButton>
                {group.canRemove ? (
                  <SidebarMenuAction
                    showOnHover
                    aria-label={`Remove ${displayedLabel}`}
                    disabled={pending}
                    onClick={() => handleRemove(entry)}
                  >
                    <TrashIcon weight="bold" />
                  </SidebarMenuAction>
                ) : null}
              </SidebarMenuItem>
            )
          })}

          {group.canAdd ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleAdd}
                disabled={pending}
                className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
              >
                <PlusIcon weight="bold" />
                <span>Add {group.kind === "knives" ? "Knife" : "Chain"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

/**
 * Sidebar fallback label for an empty Knife/Chain title. Shares the
 * editor's title placeholder so a freshly-added row reads the same on
 * both surfaces; the muted styling on the sidebar row cues "this is
 * empty, please name it."
 */
function placeholderLabel(ref: DocumentRef): string {
  if (ref.kind === "knife") return UNTITLED_KNIFE
  if (ref.kind === "chain") return UNTITLED_CHAIN
  return ref.label
}
