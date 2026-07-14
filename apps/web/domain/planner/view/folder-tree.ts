/**
 * Campaign folder-forest shaping (phase 6 — UNN-579, tech-design D11; widened
 * to Session Notes in UNN-617): the Articles, NPCs, and Session Notes rails'
 * freeform nested trees. The read is always the whole per-kind forest,
 * assembled here from adjacency-list rows; items with no folder gather in the
 * virtual **Unfiled** bucket — derived, never a stored row.
 *
 * **Degradation over disappearance:** a folder whose parent chain never
 * reaches a root (missing parent, or a cycle that slipped past the move
 * guard) is not rendered; its items — and the items of every folder in the
 * unreachable set — degrade to Unfiled instead of vanishing.
 */

import type { LinkerIconKey } from "./linker"
import type { ScheduleIconKey } from "./notes"

/** Which glyph an item row leads with: a participant's, or a beat's note page. */
export type FolderTreeIconKey = LinkerIconKey | "beat"

/** The builder's slice of a folder row. */
export interface FolderTreeFolderInput {
  id: string
  parentId: string | null
  name: string
}

/** One item leaf — an Article, NPC, or beat, shaped per kind by `view/world.ts` / `view/notes.ts`. */
export interface FolderTreeItem {
  id: string
  folderId: string | null
  name: string
  iconKey: FolderTreeIconKey
  /** NPC-only: dims the glyph and feeds the stub filter. */
  isStub?: boolean
  /** Article-only: the label-only type tag, feeds the type filter. */
  type?: string | null
  /** Beat-only: the trailing schedule glyph and its tooltip. */
  schedule?: { icon: ScheduleIconKey; label: string | null }
  /** Beat-only: an untitled beat's placeholder name renders muted. */
  isUntitled?: boolean
}

/** One rendered folder node: children sorted, items sorted, both recursive. */
export interface FolderTreeFolderView {
  id: string
  name: string
  folders: FolderTreeFolderView[]
  items: FolderTreeItem[]
}

/** The whole rail: root folders plus the derived Unfiled bucket. */
export interface FolderForestView {
  roots: FolderTreeFolderView[]
  unfiled: FolderTreeItem[]
}

/**
 * Assembles the per-kind forest: alphabetical at every level (folders and
 * items independently, case-insensitive, id tiebreak), empty folders render,
 * Unfiled holds folderless items plus everything degraded off unrooted
 * folders.
 */
export function buildFolderForest(
  folders: readonly FolderTreeFolderInput[],
  items: readonly FolderTreeItem[]
): FolderForestView {
  const rooted = rootedFolderIds(folders)
  const childrenOf = new Map<string | null, FolderTreeFolderInput[]>()
  for (const folder of folders) {
    if (!rooted.has(folder.id)) continue
    const key = folder.parentId
    const siblings = childrenOf.get(key) ?? []
    siblings.push(folder)
    childrenOf.set(key, siblings)
  }

  const itemsOf = new Map<string | null, FolderTreeItem[]>()
  const unfiled: FolderTreeItem[] = []
  for (const item of items) {
    if (item.folderId === null || !rooted.has(item.folderId)) {
      unfiled.push(item)
      continue
    }
    const siblings = itemsOf.get(item.folderId) ?? []
    siblings.push(item)
    itemsOf.set(item.folderId, siblings)
  }

  const build = (folder: FolderTreeFolderInput): FolderTreeFolderView => ({
    id: folder.id,
    name: folder.name,
    folders: sortByName(childrenOf.get(folder.id) ?? []).map(build),
    items: sortByName(itemsOf.get(folder.id) ?? []),
  })

  return {
    roots: sortByName(childrenOf.get(null) ?? []).map(build),
    unfiled: sortByName(unfiled),
  }
}

/**
 * True when `candidateId` sits inside `folderId`'s subtree — **self counts**,
 * so a folder can't become its own parent. The move guard, shared by the
 * server action and the Move-to menu's disabled rows; cycle-safe (a visited
 * set), since it must not loop on the very corruption it guards against.
 */
export function isDescendant(
  folders: readonly FolderTreeFolderInput[],
  folderId: string,
  candidateId: string
): boolean {
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]))
  const visited = new Set<string>()
  let current: string | null | undefined = candidateId
  while (current !== null && current !== undefined) {
    if (current === folderId) return true
    if (visited.has(current)) return false
    visited.add(current)
    current = parentOf.get(current)
  }
  return false
}

/**
 * Prunes items by predicate and drops folders left recursively empty — the
 * search box and the type/stub filter chips. A folder matching `keepFolder`
 * keeps its whole subtree untouched (a matching folder name shows everything
 * inside).
 */
export function filterFolderForest(
  forest: FolderForestView,
  keep: (item: FolderTreeItem) => boolean,
  keepFolder: (folder: FolderTreeFolderView) => boolean = () => false
): FolderForestView {
  const filterFolder = (
    folder: FolderTreeFolderView
  ): FolderTreeFolderView | null => {
    if (keepFolder(folder)) return folder
    const folders = folder.folders
      .map(filterFolder)
      .filter((f): f is FolderTreeFolderView => f !== null)
    const items = folder.items.filter(keep)
    if (folders.length === 0 && items.length === 0) return null
    return { ...folder, folders, items }
  }
  return {
    roots: forest.roots
      .map(filterFolder)
      .filter((f): f is FolderTreeFolderView => f !== null),
    unfiled: forest.unfiled.filter(keep),
  }
}

/** Subtree totals (the folder itself excluded) — the delete confirm's copy. */
export function countFolderContents(folder: FolderTreeFolderView): {
  folders: number
  items: number
} {
  let folders = 0
  let items = folder.items.length
  for (const child of folder.folders) {
    const counts = countFolderContents(child)
    folders += 1 + counts.folders
    items += counts.items
  }
  return { folders, items }
}

/** Ids of folders whose parent chain reaches a root without repeating. */
function rootedFolderIds(
  folders: readonly FolderTreeFolderInput[]
): Set<string> {
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]))
  const rooted = new Set<string>()
  for (const folder of folders) {
    const path: string[] = []
    let current: string | null | undefined = folder.id
    let reachesRoot = false
    while (current !== null && current !== undefined) {
      if (rooted.has(current)) {
        reachesRoot = true
        break
      }
      if (path.includes(current)) break
      path.push(current)
      current = parentOf.get(current)
    }
    if (current === null || reachesRoot) {
      for (const id of path) rooted.add(id)
    }
  }
  return rooted
}

function sortByName<T extends { id: string; name: string }>(
  values: readonly T[]
): T[] {
  return [...values].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id)
  )
}
