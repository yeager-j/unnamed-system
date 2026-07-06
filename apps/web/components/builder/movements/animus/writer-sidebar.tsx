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

import { useEntityWrite, useLoadedCharacter } from "@/hooks/use-entity-write"

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
 * Add (Knives/Chains only) dispatches a `narrative.addListEntry` descriptor;
 * the new entry's index is the current list length, so the selection can move
 * there optimistically — the row itself appears in the same frame via the
 * provider's optimistic narrative.
 *
 * Remove (Knives/Chains only) dispatches `narrative.removeListEntry`.
 * Entries are index-addressed (v2 stores ordered lists, no row ids), so a
 * removal shifts every later sibling down one: the selection follows —
 * reset to Backstory when the active entry itself was removed, decrement
 * when a preceding sibling was.
 */
export function WriterSidebar() {
  const { entity } = useLoadedCharacter()
  const groups = buildDocumentGroups(entity.components.narrative)

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
      <h1 className="font-display text-3xl font-semibold text-sidebar-foreground">
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
  const { entity } = useLoadedCharacter()
  const { pending, dispatch } = useEntityWrite()

  const showCount = group.kind === "knives" || group.kind === "chains"
  const showHeading = group.kind !== "backstory"

  function handleAdd() {
    const kind = group.kind
    if (kind !== "knives" && kind !== "chains") return
    const message =
      kind === "knives"
        ? "Couldn't add the Knife. Try again."
        : "Couldn't add the Chain. Try again."
    const newIndex = entity.components.narrative?.[kind].length ?? 0
    dispatch(
      { component: "narrative", op: "addListEntry", list: kind },
      {
        messages: { stale: message, error: message },
        onSuccess: () =>
          selectDocument({
            kind: kind === "knives" ? "knife" : "chain",
            id: String(newIndex),
            label: "",
          }),
      }
    )
  }

  function handleRemove(ref: DocumentRef) {
    if (!group.canRemove) return
    if (ref.kind !== "knife" && ref.kind !== "chain") return

    const list = ref.kind === "knife" ? "knives" : "chains"
    const removedIndex = Number(ref.id)
    const message =
      ref.kind === "knife"
        ? "Couldn't remove the Knife. Try again."
        : "Couldn't remove the Chain. Try again."

    dispatch(
      {
        component: "narrative",
        op: "removeListEntry",
        list,
        index: removedIndex,
      },
      {
        messages: { stale: message, error: message },
        onSuccess: () => {
          if (activeRef.kind !== ref.kind) return
          const activeIndex = Number(activeRef.id)
          if (activeIndex === removedIndex) {
            resetToDefault()
          } else if (activeIndex > removedIndex) {
            selectDocument({ ...activeRef, id: String(activeIndex - 1) })
          }
        },
      }
    )
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
