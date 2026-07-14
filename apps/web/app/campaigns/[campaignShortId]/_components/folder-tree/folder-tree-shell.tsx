"use client"

import { usePathname } from "next/navigation"
import { createContext, useContext, useMemo, useState } from "react"

import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@workspace/ui/components/sidebar"

import type {
  FolderForestView,
  FolderTreeItem,
} from "@/domain/planner/view/folder-tree"
import type { NarrativeTextField } from "@/domain/vocab"
import type { CampaignFolderKind } from "@/lib/db/schema/campaign-folder"
import { campaignNpcPath } from "@/lib/paths"

import { WorldDocRail } from "../world/world-doc-rail"
import { FolderTree } from "./folder-tree"

/**
 * The rails' name mirror (UNN-579): a detail page's title autosave never
 * revalidates (D10), so the page pushes each keystroke's name here and the
 * layout-owned tree row reflects it instantly. Layout revalidation (any
 * structural write) resets the base and the override becomes a no-op.
 *
 * The tree (layout) and the editor (page) sit across a segment boundary with
 * no prop path — context is the seam.
 */
const FolderTreeNameMirrorContext = createContext<{
  names: Record<string, string>
  setName: (id: string, name: string) => void
} | null>(null)

/** The detail pages' half of the mirror; a no-op setter outside the shell. */
export function useFolderTreeNameMirror(): (id: string, name: string) => void {
  const mirror = useContext(FolderTreeNameMirrorContext)
  return mirror?.setName ?? (() => {})
}

/**
 * The Articles / NPCs / Session Notes shell (UNN-579, D11; sessions folded in
 * by UNN-617): the layout-owned folder tree in a sticky sidebar, the routed
 * page (index empty state or a detail editor) in the inset — one segment up
 * from the detail routes so the tree survives navigation with its
 * expand/collapse state intact (lifted here for exactly that reason).
 *
 * **Master-detail drill-down on NPC pages:** an open NPC swaps the sidebar's
 * content to that NPC's document rail (`WorldDocRail` — back row, Overview +
 * narrative documents) so the page never stacks a third column. The swap is
 * pathname-derived, SSR-consistent, and the doc selection rides `?doc=` so
 * the layout-owned rail and the page-owned editor agree through the URL.
 */
export function FolderTreeShell({
  kind,
  campaignId,
  campaignShortId,
  campaignName,
  dayLine,
  forest,
  typeOptions,
  npcDocs,
  children,
}: {
  kind: CampaignFolderKind
  campaignId: string
  campaignShortId: string
  campaignName: string
  dayLine: string | null
  forest: FolderForestView
  /** Article surfaces: the campaign's distinct type tags (filter chips). */
  typeOptions: string[]
  /** NPC surfaces: per-entity doc emptiness, keyed entityId → field (the rail's muted rows). */
  npcDocs?: Record<string, Record<NarrativeTextField, boolean>>
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [names, setNames] = useState<Record<string, string>>({})
  const [collapsed, setCollapsed] = useState<Set<string | null>>(new Set())
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

  const mirrored: FolderForestView = useMemo(
    () => applyNameMirror(forest, names),
    [forest, names]
  )

  const openNpc =
    kind === "npc" && npcDocs !== undefined
      ? findItem(
          mirrored,
          (item) => campaignNpcPath(campaignShortId, item.id) === pathname
        )
      : null

  return (
    <FolderTreeNameMirrorContext.Provider value={mirror}>
      <SidebarProvider className="min-h-0 flex-1 bg-sidebar">
        <Sidebar
          collapsible="none"
          className="sticky top-14 h-[calc(100svh-3.5rem)] shrink-0"
        >
          {openNpc !== null && npcDocs?.[openNpc.id] !== undefined ? (
            <WorldDocRail
              campaignShortId={campaignShortId}
              entityId={openNpc.id}
              name={openNpc.name}
              emptiness={npcDocs[openNpc.id]!}
            />
          ) : (
            <FolderTree
              kind={kind}
              campaignId={campaignId}
              campaignShortId={campaignShortId}
              campaignName={campaignName}
              dayLine={dayLine}
              forest={mirrored}
              typeOptions={typeOptions}
              collapsed={collapsed}
              onCollapsedChange={setCollapsed}
            />
          )}
        </Sidebar>
        <SidebarInset className="m-2 ml-0 min-w-0 rounded-xl shadow-sm">
          {children}
        </SidebarInset>
      </SidebarProvider>
    </FolderTreeNameMirrorContext.Provider>
  )
}

function findItem(
  forest: FolderForestView,
  match: (item: FolderTreeItem) => boolean
): FolderTreeItem | null {
  const fromFolder = (
    folder: FolderForestView["roots"][number]
  ): FolderTreeItem | null =>
    folder.items.find(match) ??
    folder.folders.reduce<FolderTreeItem | null>(
      (found, child) => found ?? fromFolder(child),
      null
    )
  return (
    forest.unfiled.find(match) ??
    forest.roots.reduce<FolderTreeItem | null>(
      (found, root) => found ?? fromFolder(root),
      null
    )
  )
}

function applyNameMirror(
  forest: FolderForestView,
  names: Record<string, string>
): FolderForestView {
  if (Object.keys(names).length === 0) return forest
  const mirrorItems = (items: FolderTreeItem[]): FolderTreeItem[] =>
    items.map((item) =>
      names[item.id] === undefined ? item : { ...item, name: names[item.id]! }
    )
  const mirrorFolder = (
    folder: FolderForestView["roots"][number]
  ): FolderForestView["roots"][number] => ({
    ...folder,
    folders: folder.folders.map(mirrorFolder),
    items: mirrorItems(folder.items),
  })
  return {
    roots: forest.roots.map(mirrorFolder),
    unfiled: mirrorItems(forest.unfiled),
  }
}
