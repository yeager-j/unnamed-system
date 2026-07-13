/**
 * World folder-forest shaping (phase 6 — UNN-579, tech-design D11): the
 * Articles/NPCs rails' freeform nested trees. The read is always the whole
 * per-kind forest, assembled here from adjacency-list rows; items with no
 * folder gather in the virtual **Unfiled** bucket — derived, never a stored
 * row (the `buildNotesTree` discipline, recursive).
 *
 * **Degradation over disappearance:** a folder whose parent chain never
 * reaches a root (missing parent, or a cycle that slipped past the move
 * guard) is not rendered; its items — and the items of every folder in the
 * unreachable set — degrade to Unfiled instead of vanishing.
 */

import type { LinkerIconKey } from "./linker"

/** The builder's slice of a folder row. */
export interface WorldFolderInput {
  id: string
  parentId: string | null
  name: string
}

/** One item leaf (an Article or NPC), shaped per kind by `view/world.ts`. */
export interface WorldTreeItem {
  id: string
  folderId: string | null
  name: string
  iconKey: LinkerIconKey
  /** NPC-only: renders the Stub badge and feeds the stub filter. */
  isStub?: boolean
  /** Article-only: the label-only type tag, feeds the type filter. */
  type?: string | null
}

/** One rendered folder node: children sorted, items sorted, both recursive. */
export interface WorldTreeFolderView {
  id: string
  name: string
  folders: WorldTreeFolderView[]
  items: WorldTreeItem[]
}

/** The whole rail: root folders plus the derived Unfiled bucket. */
export interface WorldForestView {
  roots: WorldTreeFolderView[]
  unfiled: WorldTreeItem[]
}

/**
 * Assembles the per-kind forest: alphabetical at every level (folders and
 * items independently, case-insensitive, id tiebreak), empty folders render,
 * Unfiled holds folderless items plus everything degraded off unrooted
 * folders.
 */
export function buildWorldForest(
  folders: readonly WorldFolderInput[],
  items: readonly WorldTreeItem[]
): WorldForestView {
  const rooted = rootedFolderIds(folders)
  const childrenOf = new Map<string | null, WorldFolderInput[]>()
  for (const folder of folders) {
    if (!rooted.has(folder.id)) continue
    const key = folder.parentId
    const siblings = childrenOf.get(key) ?? []
    siblings.push(folder)
    childrenOf.set(key, siblings)
  }

  const itemsOf = new Map<string | null, WorldTreeItem[]>()
  const unfiled: WorldTreeItem[] = []
  for (const item of items) {
    if (item.folderId === null || !rooted.has(item.folderId)) {
      unfiled.push(item)
      continue
    }
    const siblings = itemsOf.get(item.folderId) ?? []
    siblings.push(item)
    itemsOf.set(item.folderId, siblings)
  }

  const build = (folder: WorldFolderInput): WorldTreeFolderView => ({
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
  folders: readonly WorldFolderInput[],
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
 * keeps its whole subtree untouched (the notes-tree search semantic: a
 * matching folder name shows everything inside).
 */
export function filterWorldForest(
  forest: WorldForestView,
  keep: (item: WorldTreeItem) => boolean,
  keepFolder: (folder: WorldTreeFolderView) => boolean = () => false
): WorldForestView {
  const filterFolder = (
    folder: WorldTreeFolderView
  ): WorldTreeFolderView | null => {
    if (keepFolder(folder)) return folder
    const folders = folder.folders
      .map(filterFolder)
      .filter((f): f is WorldTreeFolderView => f !== null)
    const items = folder.items.filter(keep)
    if (folders.length === 0 && items.length === 0) return null
    return { ...folder, folders, items }
  }
  return {
    roots: forest.roots
      .map(filterFolder)
      .filter((f): f is WorldTreeFolderView => f !== null),
    unfiled: forest.unfiled.filter(keep),
  }
}

/** Subtree totals (the folder itself excluded) — the delete confirm's copy. */
export function countFolderContents(folder: WorldTreeFolderView): {
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
function rootedFolderIds(folders: readonly WorldFolderInput[]): Set<string> {
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
