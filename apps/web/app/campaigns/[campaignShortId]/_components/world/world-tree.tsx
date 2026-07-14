"use client"

import {
  CaretDownIcon,
  CaretRightIcon,
  DotsThreeIcon,
  FolderIcon,
  FolderPlusIcon,
  MoonStarsIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"

import {
  filterWorldForest,
  type WorldForestView,
  type WorldTreeFolderView,
  type WorldTreeItem,
} from "@/domain/planner/view/world-tree"
import {
  createFolderAction,
  deleteFolderAction,
  moveFolderAction,
  renameFolderAction,
} from "@/lib/actions/campaign-world/folder"
import {
  moveArticleToFolderAction,
  moveNpcToFolderAction,
} from "@/lib/actions/campaign-world/move-item"
import type { WorldFolderKind } from "@/lib/db/schema/campaign-world"
import { campaignArticlePath, campaignNpcPath } from "@/lib/paths"

import {
  DeleteEntityConfirm,
  type DeleteEntityTarget,
} from "./delete-entity-confirm"
import { mintParticipantRef } from "./mint-participant-ref"
import { KindIcon } from "./participant-linker"
import { DeleteFolderDialog, NameDialog } from "./world-tree-dialogs"

const COPY: Record<
  WorldFolderKind,
  {
    surface: string
    newItem: string
    searchPlaceholder: string
    searchAria: string
    emptyHint: string
    mintTitle: string
    mintDescription: string
    mintPlaceholder: string
  }
> = {
  article: {
    surface: "Articles",
    newItem: "New article",
    searchPlaceholder: "Search articles…",
    searchAria: "Search articles",
    emptyHint:
      "The world web lives here: places, factions, threats, lore. Mint an article to get started.",
    mintTitle: "New article",
    mintDescription:
      "A name mints the page; prose, a type, and dates come after.",
    mintPlaceholder: "The Sunken Library",
  },
  npc: {
    surface: "NPCs",
    newItem: "New NPC",
    searchPlaceholder: "Search NPCs…",
    searchAria: "Search NPCs",
    emptyHint:
      "The people of the world live here. Quick-mint a name now — traits and prose deepen later.",
    mintTitle: "New NPC",
    mintDescription:
      "A name mints a stub; Arcana, Lineage, and prose deepen it.",
    mintPlaceholder: "Maren of the Fens",
  },
}

/** One flattened Move-to target row. */
interface MoveTargetRow {
  id: string
  name: string
  depth: number
}

/**
 * The Articles/NPCs folder tree (UNN-579, D11): recursive disclosure rows,
 * items as links to their detail routes (active = pathname), a folder ⋯ menu
 * (rename / move / new subfolder / delete) and an item ⋯ menu (move /
 * delete). "Move to…" is a dropdown sub-menu over the flattened forest —
 * rows inside the moved folder's own subtree disabled, the same
 * `isDescendant` fact the server enforces. Expand/collapse and the filters
 * are client-local.
 */
export function WorldTree({
  kind,
  campaignId,
  campaignShortId,
  campaignName,
  dayLine,
  forest,
  typeOptions,
  collapsed,
  onCollapsedChange,
}: {
  kind: WorldFolderKind
  campaignId: string
  campaignShortId: string
  campaignName: string
  dayLine: string | null
  forest: WorldForestView
  typeOptions: string[]
  /** Expand/collapse lives in the shell so it survives the doc-rail swap. */
  collapsed: Set<string | null>
  onCollapsedChange: (next: Set<string | null>) => void
}) {
  const copy = COPY[kind]
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [hideStubs, setHideStubs] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [mintOpen, setMintOpen] = useState(false)

  const itemPath = (id: string) =>
    kind === "article"
      ? campaignArticlePath(campaignShortId, id)
      : campaignNpcPath(campaignShortId, id)

  const run = (
    write: () => Promise<{ ok: true } | { ok: false; error: string }>,
    errorMessage = "Couldn't save. Try again."
  ) =>
    startTransition(async () => {
      const result = await write()
      if (!result.ok) toast.error(errorMessage)
    })

  const mint = (name: string) =>
    startTransition(async () => {
      const ref = await mintParticipantRef(kind, campaignId, name)
      if (ref) router.push(itemPath(ref.id))
    })

  const toggle = (folderId: string | null) => {
    const next = new Set(collapsed)
    if (next.has(folderId)) next.delete(folderId)
    else next.add(folderId)
    onCollapsedChange(next)
  }

  const needle = query.trim().toLowerCase()
  let visible = forest
  if (needle !== "") {
    visible = filterWorldForest(
      visible,
      (item) => item.name.toLowerCase().includes(needle),
      (folder) => folder.name.toLowerCase().includes(needle)
    )
  }
  if (kind === "article" && typeFilter !== null) {
    visible = filterWorldForest(visible, (item) => item.type === typeFilter)
  }
  if (kind === "npc" && hideStubs) {
    visible = filterWorldForest(visible, (item) => item.isStub !== true)
  }

  const moveTargets = flattenForest(forest)
  // The delete confirm must count the REAL subtree, not the filtered view —
  // a search/type filter prunes `visible`, but the cascade deletes everything.
  const unfilteredFolder = (id: string) => findFolderById(forest, id)
  const isEmpty = forest.roots.length === 0 && forest.unfiled.length === 0
  const nothingMatches =
    !isEmpty && visible.roots.length === 0 && visible.unfiled.length === 0

  const shared: TreeContext = {
    kind,
    campaignId,
    collapsed,
    toggle,
    itemPath,
    activePath: pathname,
    moveTargets,
    unfilteredFolder,
    onRenameFolder: (folderId, name) =>
      run(() => renameFolderAction({ campaignId, folderId, name })),
    onDeleteFolder: (folderId) =>
      run(() => deleteFolderAction({ campaignId, folderId })),
    onMoveFolder: (folderId, parentId) =>
      run(
        () => moveFolderAction({ campaignId, folderId, parentId }),
        "Couldn't move the folder. Try again."
      ),
    onCreateSubfolder: (parentId, name) =>
      run(() => createFolderAction({ campaignId, kind, name, parentId })),
    onMoveItem: (itemId, folderId) =>
      run(
        () =>
          kind === "article"
            ? moveArticleToFolderAction({
                campaignId,
                articleId: itemId,
                folderId,
              })
            : moveNpcToFolderAction({ campaignId, entityId: itemId, folderId }),
        "Couldn't move it. Try again."
      ),
  }

  return (
    <>
      <SidebarHeader className="gap-2 p-4">
        {dayLine ? (
          <div className="flex items-center gap-1.5 self-start rounded-full border px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
            <MoonStarsIcon className="size-3.5 text-gold" />
            {dayLine}
          </div>
        ) : null}
        <div className="font-display text-lg leading-tight text-foreground">
          {campaignName}
        </div>
        <div className="flex items-center gap-1">
          <span className="flex-1 text-sm font-semibold">{copy.surface}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New folder"
            onClick={() => setNewFolderOpen(true)}
          >
            <FolderPlusIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={copy.newItem}
            onClick={() => setMintOpen(true)}
          >
            <PlusIcon />
          </Button>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.searchPlaceholder}
          aria-label={copy.searchAria}
        />
        {kind === "article" && typeOptions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {typeOptions.map((type) => (
              <Badge
                key={type}
                variant={typeFilter === type ? "default" : "outline"}
                className="cursor-pointer select-none"
                onClick={() =>
                  setTypeFilter((current) => (current === type ? null : type))
                }
              >
                {type}
              </Badge>
            ))}
          </div>
        ) : null}
        {kind === "npc" ? (
          <div className="flex flex-wrap gap-1">
            <Badge
              variant={hideStubs ? "default" : "outline"}
              className="cursor-pointer select-none"
              onClick={() => setHideStubs((current) => !current)}
            >
              Hide stubs
            </Badge>
          </div>
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {isEmpty ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">
                {copy.emptyHint}
              </p>
            ) : nothingMatches ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">
                Nothing matches{needle !== "" ? ` "${query.trim()}"` : ""}.
              </p>
            ) : (
              <>
                {visible.roots.map((folder) => (
                  <FolderRows
                    key={folder.id}
                    folder={folder}
                    depth={0}
                    ctx={shared}
                  />
                ))}
                {visible.unfiled.length > 0 ? (
                  <UnfiledRows items={visible.unfiled} ctx={shared} />
                ) : null}
              </>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {newFolderOpen ? (
        <NameDialog
          title="New folder"
          description="Folders organize the rail — nest them freely; nothing else changes."
          confirmLabel="Create"
          initialValue=""
          placeholder="The Fens"
          onOpenChange={setNewFolderOpen}
          onSubmit={(name) =>
            run(() =>
              createFolderAction({ campaignId, kind, name, parentId: null })
            )
          }
        />
      ) : null}
      {mintOpen ? (
        <NameDialog
          title={copy.mintTitle}
          description={copy.mintDescription}
          confirmLabel="Create"
          initialValue=""
          placeholder={copy.mintPlaceholder}
          onOpenChange={setMintOpen}
          onSubmit={mint}
        />
      ) : null}
    </>
  )
}

/** The callbacks and lookups every row shares — one bag, not eight props. */
interface TreeContext {
  kind: WorldFolderKind
  campaignId: string
  collapsed: Set<string | null>
  toggle: (folderId: string | null) => void
  itemPath: (id: string) => string
  activePath: string
  moveTargets: MoveTargetRow[]
  /** The folder's node in the UNFILTERED forest — the delete confirm's honest count. */
  unfilteredFolder: (id: string) => WorldTreeFolderView | null
  onRenameFolder: (folderId: string, name: string) => void
  onDeleteFolder: (folderId: string) => void
  onMoveFolder: (folderId: string, parentId: string | null) => void
  onCreateSubfolder: (parentId: string, name: string) => void
  onMoveItem: (itemId: string, folderId: string | null) => void
}

function FolderRows({
  folder,
  depth,
  ctx,
}: {
  folder: WorldTreeFolderView
  depth: number
  ctx: TreeContext
}) {
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [subfolderOpen, setSubfolderOpen] = useState(false)
  const isCollapsed = ctx.collapsed.has(folder.id)
  const ownSubtree = subtreeIds(folder)

  return (
    <SidebarMenu>
      <SidebarMenuItem style={indent(depth)}>
        <div className="group/folder flex items-center">
          <SidebarMenuButton
            onClick={() => ctx.toggle(folder.id)}
            className="flex-1 font-medium"
          >
            {isCollapsed ? (
              <CaretRightIcon className="size-3.5 shrink-0" />
            ) : (
              <CaretDownIcon className="size-3.5 shrink-0" />
            )}
            <FolderIcon className="size-4 shrink-0" />
            <span className="truncate">{folder.name}</span>
          </SidebarMenuButton>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${folder.name} actions`}
                  className="text-muted-foreground opacity-0 group-hover/folder:opacity-100 data-popup-open:opacity-100"
                />
              }
            >
              <DotsThreeIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSubfolderOpen(true)}>
                New folder inside
              </DropdownMenuItem>
              <MoveToSubmenu
                targets={ctx.moveTargets}
                rootLabel="Top level"
                disabledIds={ownSubtree}
                onPick={(parentId) => ctx.onMoveFolder(folder.id, parentId)}
              />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                Delete folder…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarMenuItem>
      {isCollapsed ? null : (
        <>
          {folder.folders.map((child) => (
            <FolderRows
              key={child.id}
              folder={child}
              depth={depth + 1}
              ctx={ctx}
            />
          ))}
          {folder.items.map((item) => (
            <ItemRow key={item.id} item={item} depth={depth + 1} ctx={ctx} />
          ))}
        </>
      )}
      {renameOpen ? (
        <NameDialog
          title="Rename folder"
          description="Renames the folder — its contents stay put."
          confirmLabel="Rename"
          initialValue={folder.name}
          onOpenChange={setRenameOpen}
          onSubmit={(name) => ctx.onRenameFolder(folder.id, name)}
        />
      ) : null}
      {subfolderOpen ? (
        <NameDialog
          title={`New folder in ${folder.name}`}
          description="Folders nest freely — organize the rail however the world reads."
          confirmLabel="Create"
          initialValue=""
          onOpenChange={setSubfolderOpen}
          onSubmit={(name) => ctx.onCreateSubfolder(folder.id, name)}
        />
      ) : null}
      {deleteOpen ? (
        <DeleteFolderDialog
          folder={ctx.unfilteredFolder(folder.id) ?? folder}
          onOpenChange={setDeleteOpen}
          onDelete={() => ctx.onDeleteFolder(folder.id)}
        />
      ) : null}
    </SidebarMenu>
  )
}

/** The derived Unfiled bucket — a disclosure row with no ⋯ menu (never a real row). */
function UnfiledRows({
  items,
  ctx,
}: {
  items: WorldTreeItem[]
  ctx: TreeContext
}) {
  const isCollapsed = ctx.collapsed.has(null)
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => ctx.toggle(null)}
          className="flex-1 font-medium"
        >
          {isCollapsed ? (
            <CaretRightIcon className="size-3.5 shrink-0" />
          ) : (
            <CaretDownIcon className="size-3.5 shrink-0" />
          )}
          <FolderIcon className="size-4 shrink-0" />
          <span className="truncate">Unfiled</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {isCollapsed
        ? null
        : items.map((item) => (
            <ItemRow key={item.id} item={item} depth={1} ctx={ctx} />
          ))}
    </SidebarMenu>
  )
}

function ItemRow({
  item,
  depth,
  ctx,
}: {
  item: WorldTreeItem
  depth: number
  ctx: TreeContext
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const href = ctx.itemPath(item.id)
  const target: DeleteEntityTarget = {
    kind: ctx.kind,
    id: item.id,
    name: item.name,
  }

  return (
    <SidebarMenuItem style={indent(depth)}>
      <div className="group/item flex items-center">
        <SidebarMenuButton
          isActive={ctx.activePath === href}
          render={<Link href={href} />}
          className="flex-1"
        >
          <span
            className={cn("shrink-0", item.isStub && "opacity-40")}
            title={
              item.isStub ? "Stub — a name and nothing else yet" : undefined
            }
          >
            <KindIcon iconKey={item.iconKey} />
          </span>
          <span className="flex-1 truncate">{item.name}</span>
        </SidebarMenuButton>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${item.name} actions`}
                className="text-muted-foreground opacity-0 group-hover/item:opacity-100 data-popup-open:opacity-100"
              />
            }
          >
            <DotsThreeIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <MoveToSubmenu
              targets={ctx.moveTargets}
              rootLabel="Unfiled"
              disabledIds={
                item.folderId === null ? new Set() : new Set([item.folderId])
              }
              onPick={(folderId) => ctx.onMoveItem(item.id, folderId)}
            />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {deleteOpen ? (
        <DeleteEntityConfirm
          campaignId={ctx.campaignId}
          target={target}
          onOpenChange={setDeleteOpen}
        />
      ) : null}
    </SidebarMenuItem>
  )
}

/**
 * The "Move to…" sub-menu: the flattened forest, depth-indented, the root
 * target first. `disabledIds` carries what a move cannot target — for a
 * folder, its own subtree (the client half of the D11 cycle guard); for an
 * item, the folder it is already in.
 */
function MoveToSubmenu({
  targets,
  rootLabel,
  disabledIds,
  onPick,
}: {
  targets: MoveTargetRow[]
  rootLabel: string
  disabledIds: Set<string>
  onPick: (folderId: string | null) => void
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Move to…</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
        <DropdownMenuItem onClick={() => onPick(null)}>
          {rootLabel}
        </DropdownMenuItem>
        {targets.map((row) => (
          <DropdownMenuItem
            key={row.id}
            disabled={disabledIds.has(row.id)}
            onClick={() => onPick(row.id)}
          >
            <span style={indent(row.depth)} className="flex items-center gap-2">
              <FolderIcon className="size-4 shrink-0" />
              <span className={cn("truncate")}>{row.name}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function flattenForest(forest: WorldForestView): MoveTargetRow[] {
  const rows: MoveTargetRow[] = []
  const walk = (folder: WorldTreeFolderView, depth: number) => {
    rows.push({ id: folder.id, name: folder.name, depth })
    for (const child of folder.folders) walk(child, depth + 1)
  }
  for (const root of forest.roots) walk(root, 0)
  return rows
}

function findFolderById(
  forest: WorldForestView,
  id: string
): WorldTreeFolderView | null {
  const walk = (folder: WorldTreeFolderView): WorldTreeFolderView | null => {
    if (folder.id === id) return folder
    for (const child of folder.folders) {
      const found = walk(child)
      if (found !== null) return found
    }
    return null
  }
  for (const root of forest.roots) {
    const found = walk(root)
    if (found !== null) return found
  }
  return null
}

function subtreeIds(folder: WorldTreeFolderView): Set<string> {
  const ids = new Set<string>()
  const walk = (node: WorldTreeFolderView) => {
    ids.add(node.id)
    for (const child of node.folders) walk(child)
  }
  walk(folder)
  return ids
}

function indent(depth: number): React.CSSProperties | undefined {
  return depth === 0 ? undefined : { paddingLeft: `${depth * 0.875}rem` }
}
