"use client"

import { PlusIcon, TrashIcon } from "@phosphor-icons/react"
import type { ReactNode } from "react"

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

import {
  buildDocumentGroups,
  refsEqual,
  UNTITLED_CHAIN,
  UNTITLED_KNIFE,
  type DocumentGroup,
  type DocumentRef,
} from "@/domain/character/animus/documents"
import {
  useEntityWrite,
  useLoadedCharacter,
} from "@/domain/entity/use-entity-write"

import { useAnimusDocument } from "./animus-context"

/**
 * The Animus writer's left rail. Renders the narrative document groups
 * (Backstory / Knives / Chains / Identity Traits, plus Notes on the sheet) as
 * selectable rows. Active row is highlighted via `SidebarMenuButton`'s
 * `isActive` prop; clicking sets the selection in the `AnimusDocumentContext`
 * so the pane swaps.
 *
 * `header` is a slot so each host supplies its own chrome — the builder passes
 * the Movement-3 chapter header, the sheet passes a "Back to sheet" control and
 * a section title. `includeNotes` appends the sheet-only Notes row.
 *
 * Add (Knives/Chains only) dispatches a `narrative.addListEntry` descriptor;
 * the new entry's index is the current list length, so the selection can move
 * there optimistically — the row itself appears in the same frame via the
 * provider's optimistic narrative.
 *
 * Remove (Knives/Chains only) dispatches `narrative.removeListEntry`. Entries
 * are index-addressed (v2 stores ordered lists, no row ids), so a removal
 * shifts every later sibling down one: the selection follows — reset to
 * Backstory when the active entry itself was removed, decrement when a
 * preceding sibling was. There is no minimum — a list may drop to zero.
 */
export function WriterSidebar({
  header,
  includeNotes = false,
}: {
  header?: ReactNode
  includeNotes?: boolean
}) {
  const { entity } = useLoadedCharacter()
  const groups = buildDocumentGroups(entity.components.narrative, {
    includeNotes,
  })

  return (
    <>
      {header}
      <SidebarContent>
        {groups.map((group) => (
          <SidebarSection key={group.kind} group={group} />
        ))}
      </SidebarContent>
    </>
  )
}

function SidebarSection({ group }: { group: DocumentGroup }) {
  const { activeRef, selectDocument, resetToDefault } = useAnimusDocument()
  const { entity } = useLoadedCharacter()
  const { pending, dispatch } = useEntityWrite()

  const showCount = group.kind === "knives" || group.kind === "chains"
  // Single-row sections (Backstory, Notes) label themselves via the row; the
  // repeating and multi-row sections carry a group heading.
  const showHeading = group.kind !== "backstory" && group.kind !== "notes"

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
        messages: { error: message },
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
        messages: { error: message },
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
 * Sidebar fallback label for an empty Knife/Chain title. Shares the editor's
 * title placeholder so a freshly-added row reads the same on both surfaces; the
 * muted styling on the sidebar row cues "this is empty, please name it."
 */
function placeholderLabel(ref: DocumentRef): string {
  if (ref.kind === "knife") return UNTITLED_KNIFE
  if (ref.kind === "chain") return UNTITLED_CHAIN
  return ref.label
}
