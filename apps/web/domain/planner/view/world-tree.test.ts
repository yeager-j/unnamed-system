import { describe, expect, it } from "vitest"

import {
  buildWorldForest,
  countFolderContents,
  filterWorldForest,
  isDescendant,
  type WorldFolderInput,
  type WorldTreeItem,
} from "./world-tree"

function folder(
  id: string,
  parentId: string | null,
  name = `Folder ${id}`
): WorldFolderInput {
  return { id, parentId, name }
}

function item(
  id: string,
  folderId: string | null,
  name = `Item ${id}`,
  overrides: Partial<WorldTreeItem> = {}
): WorldTreeItem {
  return { id, folderId, name, iconKey: "article", ...overrides }
}

describe("buildWorldForest", () => {
  it("nests folders recursively and files items under their folders", () => {
    const forest = buildWorldForest(
      [folder("root", null), folder("child", "root"), folder("grand", "child")],
      [item("a", "grand"), item("b", "root"), item("c", null)]
    )
    expect(forest.roots).toHaveLength(1)
    expect(forest.roots[0]!.items.map((i) => i.id)).toEqual(["b"])
    expect(
      forest.roots[0]!.folders[0]!.folders[0]!.items.map((i) => i.id)
    ).toEqual(["a"])
    expect(forest.unfiled.map((i) => i.id)).toEqual(["c"])
  })

  it("sorts folders and items alphabetically at every level, case-insensitive", () => {
    const forest = buildWorldForest(
      [
        folder("f1", null, "zebra"),
        folder("f2", null, "Apple"),
        folder("f3", "f2", "banana"),
        folder("f4", "f2", "Aardvark"),
      ],
      [item("i1", "f2", "omega"), item("i2", "f2", "Alpha")]
    )
    expect(forest.roots.map((f) => f.name)).toEqual(["Apple", "zebra"])
    expect(forest.roots[0]!.folders.map((f) => f.name)).toEqual([
      "Aardvark",
      "banana",
    ])
    expect(forest.roots[0]!.items.map((i) => i.name)).toEqual([
      "Alpha",
      "omega",
    ])
  })

  it("renders empty folders but keeps Unfiled purely derived", () => {
    const forest = buildWorldForest([folder("empty", null)], [])
    expect(forest.roots).toHaveLength(1)
    expect(forest.unfiled).toEqual([])
  })

  it("degrades a cycle's folders and their items to Unfiled instead of vanishing them", () => {
    const forest = buildWorldForest(
      [folder("a", "b"), folder("b", "a"), folder("ok", null)],
      [item("trapped", "a"), item("fine", "ok")]
    )
    expect(forest.roots.map((f) => f.id)).toEqual(["ok"])
    expect(forest.unfiled.map((i) => i.id)).toEqual(["trapped"])
  })

  it("degrades items pointing at a missing folder to Unfiled", () => {
    const forest = buildWorldForest([], [item("orphan", "gone")])
    expect(forest.unfiled.map((i) => i.id)).toEqual(["orphan"])
  })

  it("degrades the subtree hanging off a missing parent", () => {
    const forest = buildWorldForest(
      [folder("dangling", "gone"), folder("leaf", "dangling")],
      [item("x", "leaf")]
    )
    expect(forest.roots).toEqual([])
    expect(forest.unfiled.map((i) => i.id)).toEqual(["x"])
  })
})

describe("isDescendant", () => {
  const FOLDERS = [
    folder("root", null),
    folder("child", "root"),
    folder("grand", "child"),
    folder("other", null),
  ]

  it("counts the folder itself", () => {
    expect(isDescendant(FOLDERS, "root", "root")).toBe(true)
  })

  it("finds deep descendants", () => {
    expect(isDescendant(FOLDERS, "root", "grand")).toBe(true)
  })

  it("rejects non-descendants", () => {
    expect(isDescendant(FOLDERS, "child", "other")).toBe(false)
    expect(isDescendant(FOLDERS, "grand", "child")).toBe(false)
  })

  it("terminates on a cycle", () => {
    const cyclic = [folder("a", "b"), folder("b", "a")]
    expect(isDescendant(cyclic, "x", "a")).toBe(false)
  })
})

describe("filterWorldForest", () => {
  const forest = buildWorldForest(
    [folder("root", null), folder("child", "root")],
    [
      item("keep", "child", "Keep me"),
      item("drop", "root", "Drop me"),
      item("loose", null, "Keep loose"),
    ]
  )

  it("prunes items and drops recursively-empty folders", () => {
    const filtered = filterWorldForest(forest, (i) => i.name.startsWith("Keep"))
    expect(filtered.roots).toHaveLength(1)
    expect(filtered.roots[0]!.items).toEqual([])
    expect(filtered.roots[0]!.folders[0]!.items.map((i) => i.id)).toEqual([
      "keep",
    ])
    expect(filtered.unfiled.map((i) => i.id)).toEqual(["loose"])
  })

  it("drops everything when nothing matches", () => {
    const filtered = filterWorldForest(forest, () => false)
    expect(filtered.roots).toEqual([])
    expect(filtered.unfiled).toEqual([])
  })

  it("keeps a matching folder's whole subtree untouched", () => {
    const filtered = filterWorldForest(
      forest,
      () => false,
      (f) => f.id === "child"
    )
    expect(filtered.roots).toHaveLength(1)
    expect(filtered.roots[0]!.folders[0]!.items.map((i) => i.id)).toEqual([
      "keep",
    ])
  })
})

describe("countFolderContents", () => {
  it("totals descendant folders and items, excluding the folder itself", () => {
    const forest = buildWorldForest(
      [folder("root", null), folder("child", "root"), folder("grand", "child")],
      [item("a", "root"), item("b", "child"), item("c", "grand")]
    )
    expect(countFolderContents(forest.roots[0]!)).toEqual({
      folders: 2,
      items: 3,
    })
  })
})
