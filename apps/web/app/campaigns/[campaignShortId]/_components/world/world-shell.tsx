"use client"

import { createContext, useContext, useMemo, useState } from "react"

import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@workspace/ui/components/sidebar"

import type {
  WorldForestView,
  WorldTreeItem,
} from "@/domain/planner/view/world-tree"
import type { WorldFolderKind } from "@/lib/db/schema/campaign-world"

import { WorldTree } from "./world-tree"

/**
 * The world rails' name mirror (UNN-579): a detail page's title autosave
 * never revalidates (D10), so the page pushes each keystroke's name here and
 * the layout-owned tree row reflects it instantly. Layout revalidation (any
 * structural write) resets the base and the override becomes a no-op.
 *
 * Notes' shell solved this with a callback prop, but here the tree (layout)
 * and the editor (page) sit across a segment boundary with no prop path —
 * context is the seam.
 */
const WorldNameMirrorContext = createContext<{
  names: Record<string, string>
  setName: (id: string, name: string) => void
} | null>(null)

/** The detail pages' half of the mirror; a no-op setter outside the shell. */
export function useWorldNameMirror(): (id: string, name: string) => void {
  const mirror = useContext(WorldNameMirrorContext)
  return mirror?.setName ?? (() => {})
}

/**
 * The Articles/NPCs surface shell (UNN-579, D11): the layout-owned folder
 * tree in a sticky sidebar, the routed page (index empty state or a detail
 * editor) in the inset — the Session Notes experience, one segment up so the
 * tree survives detail navigation with its expand/collapse state intact.
 */
export function WorldShell({
  kind,
  campaignId,
  campaignShortId,
  campaignName,
  dayLine,
  forest,
  typeOptions,
  children,
}: {
  kind: WorldFolderKind
  campaignId: string
  campaignShortId: string
  campaignName: string
  dayLine: string | null
  forest: WorldForestView
  /** Article surfaces: the campaign's distinct type tags (filter chips). */
  typeOptions: string[]
  children: React.ReactNode
}) {
  const [names, setNames] = useState<Record<string, string>>({})
  const mirror = useMemo(
    () => ({
      names,
      setName: (id: string, name: string) =>
        setNames((previous) =>
          previous[id] === name ? previous : { ...previous, [id]: name }
        ),
    }),
    [names]
  )

  const mirrored: WorldForestView = useMemo(
    () => applyNameMirror(forest, names),
    [forest, names]
  )

  return (
    <WorldNameMirrorContext.Provider value={mirror}>
      <SidebarProvider className="min-h-0 flex-1 bg-sidebar">
        <Sidebar
          collapsible="none"
          className="sticky top-14 h-[calc(100svh-3.5rem)] shrink-0"
        >
          <WorldTree
            kind={kind}
            campaignId={campaignId}
            campaignShortId={campaignShortId}
            campaignName={campaignName}
            dayLine={dayLine}
            forest={mirrored}
            typeOptions={typeOptions}
          />
        </Sidebar>
        <SidebarInset className="m-2 ml-0 min-w-0 rounded-xl shadow-sm">
          {children}
        </SidebarInset>
      </SidebarProvider>
    </WorldNameMirrorContext.Provider>
  )
}

function applyNameMirror(
  forest: WorldForestView,
  names: Record<string, string>
): WorldForestView {
  if (Object.keys(names).length === 0) return forest
  const mirrorItems = (items: WorldTreeItem[]): WorldTreeItem[] =>
    items.map((item) =>
      names[item.id] === undefined ? item : { ...item, name: names[item.id]! }
    )
  const mirrorFolder = (
    folder: WorldForestView["roots"][number]
  ): WorldForestView["roots"][number] => ({
    ...folder,
    folders: folder.folders.map(mirrorFolder),
    items: mirrorItems(folder.items),
  })
  return {
    roots: forest.roots.map(mirrorFolder),
    unfiled: mirrorItems(forest.unfiled),
  }
}
