"use client"

import {
  CaretDownIcon,
  CaretRightIcon,
  DotsThreeIcon,
  FileTextIcon,
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
  filterFolderForest,
  type FolderForestView,
  type FolderTreeFolderView,
  type FolderTreeItem,
} from "@/domain/planner/view/folder-tree"
import {
  createFolderAction,
  deleteFolderAction,
  moveFolderAction,
  renameFolderAction,
} from "@/lib/actions/campaign-folders/folder"
import {
  moveArticleToFolderAction,
  moveBeatToFolderAction,
  moveNpcToFolderAction,
} from "@/lib/actions/campaign-folders/move-item"
import type { CampaignFolderKind } from "@/lib/db/schema/campaign-folder"
import {
  campaignArticlePath,
  campaignBeatPath,
  campaignNpcPath,
} from "@/lib/paths"

import { DeleteBeatConfirm } from "../notes/delete-beat-confirm"
import { ScheduleGlyph } from "../notes/schedule-control"
import { DeleteEntityConfirm } from "../world/delete-entity-confirm"
import { KindIcon } from "../world/participant-linker"
import { DeleteFolderDialog, NameDialog } from "./folder-tree-dialogs"
import { mintTreeItem } from "./mint-tree-item"

const COPY: Record<
  CampaignFolderKind,
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
  session: {
    surface: "Session Notes",
    newItem: "New beat",
    searchPlaceholder: "Search beats…",
    searchAria: "Search beats",
    emptyHint:
      "Prep lives here — one beat per scene. Folders are sessions; nest them however the table runs.",
    mintTitle: "New beat",
    mintDescription:
      "A name mints the note; the scene and its slot come after.",
    mintPlaceholder: "The Queen's offer",
  },
}

/** One flattened Move-to target row. */
interface MoveTargetRow {
  id: string
  name: string
  depth: number
}

/**
 * The shared folder tree (UNN-579, D11 — Articles and NPCs; Session Notes
 * folded in by UNN-617): recursive disclosure rows, items as links to their
 * detail routes (active = pathname), a folder ⋯ menu (new item inside /
 * rename / new subfolder / move / delete) and an item ⋯ menu (move / delete).
 * "Move to…" is a dropdown sub-menu over the flattened forest — rows inside
 * the moved folder's own subtree disabled, the same `isDescendant` fact the
 * server enforces. Expand/collapse and the filters are client-local.
 */
export function FolderTree({
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
  kind: CampaignFolderKind
  campaignId: string
  campaignShortId: string
  campaignName: string
  dayLine: string | null
  forest: FolderForestView
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

  const itemPath = (id: string) => {
    if (kind === "article") return campaignArticlePath(campaignShortId, id)
    if (kind === "npc") return campaignNpcPath(campaignShortId, id)
    return campaignBeatPath(campaignShortId, id)
  }

  const run = (
    write: () => Promise<{ ok: true } | { ok: false; error: string }>,
    errorMessage = "Couldn't save. Try again."
  ) =>
    startTransition(async () => {
      const result = await write()
      if (!result.ok) toast.error(errorMessage)
    })

  const mint = (name: string, folderId: string | null) =>
    startTransition(async () => {
      const id = await mintTreeItem(kind, campaignId, name, folderId)
      if (id === null) {
        toast.error("Couldn't create it. Try again.")
        return
      }
      router.push(itemPath(id))
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
    visible = filterFolderForest(
      visible,
      (item) => item.name.toLowerCase().includes(needle),
      (folder) => folder.name.toLowerCase().includes(needle)
    )
  }
  if (kind === "article" && typeFilter !== null) {
    visible = filterFolderForest(visible, (item) => item.type === typeFilter)
  }
  if (kind === "npc" && hideStubs) {
    visible = filterFolderForest(visible, (item) => item.isStub !== true)
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
    newItemLabel: copy.newItem,
    mintCopy: {
      title: copy.mintTitle,
      description: copy.mintDescription,
      placeholder: copy.mintPlaceholder,
    },
    onMintItem: mint,
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
        () => moveItem(kind, campaignId, itemId, folderId),
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
          onSubmit={(name) => mint(name, null)}
        />
      ) : null}
    </>
  )
}

/** Re-files an item into a folder — the one place the item kinds fork. */
function moveItem(
  kind: CampaignFolderKind,
  campaignId: string,
  itemId: string,
  folderId: string | null
) {
  if (kind === "article") {
    return moveArticleToFolderAction({
      campaignId,
      articleId: itemId,
      folderId,
    })
  }
  if (kind === "npc") {
    return moveNpcToFolderAction({ campaignId, entityId: itemId, folderId })
  }
  return moveBeatToFolderAction({ campaignId, beatId: itemId, folderId })
}

/** The callbacks and lookups every row shares — one bag, not eight props. */
interface TreeContext {
  kind: CampaignFolderKind
  campaignId: string
  collapsed: Set<string | null>
  toggle: (folderId: string | null) => void
  itemPath: (id: string) => string
  activePath: string
  moveTargets: MoveTargetRow[]
  /** The folder's node in the UNFILTERED forest — the delete confirm's honest count. */
  unfilteredFolder: (id: string) => FolderTreeFolderView | null
  /** "New article" / "New NPC" / "New beat" — the folder menu's mint row. */
  newItemLabel: string
  mintCopy: { title: string; description: string; placeholder: string }
  onMintItem: (name: string, folderId: string | null) => void
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
  folder: FolderTreeFolderView
  depth: number
  ctx: TreeContext
}) {
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [subfolderOpen, setSubfolderOpen] = useState(false)
  const [mintOpen, setMintOpen] = useState(false)
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
              <DropdownMenuItem onClick={() => setMintOpen(true)}>
                {ctx.newItemLabel} here
              </DropdownMenuItem>
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
      {mintOpen ? (
        <NameDialog
          title={`${ctx.mintCopy.title} in ${folder.name}`}
          description={ctx.mintCopy.description}
          confirmLabel="Create"
          initialValue=""
          placeholder={ctx.mintCopy.placeholder}
          onOpenChange={setMintOpen}
          onSubmit={(name) => ctx.onMintItem(name, folder.id)}
        />
      ) : null}
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
  items: FolderTreeItem[]
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
  item: FolderTreeItem
  depth: number
  ctx: TreeContext
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const href = ctx.itemPath(item.id)

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
            <ItemIcon item={item} />
          </span>
          <span
            className={cn(
              "flex-1 truncate",
              item.isUntitled && "text-muted-foreground"
            )}
          >
            {item.name}
          </span>
          {item.schedule !== undefined && item.schedule.icon !== "none" ? (
            <span title={item.schedule.label ?? undefined}>
              <ScheduleGlyph
                kind={item.schedule.icon}
                className={cn(
                  "size-3.5",
                  item.schedule.icon === "scheduled" && "text-primary-text"
                )}
              />
            </span>
          ) : null}
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
        ctx.kind === "session" ? (
          <DeleteBeatConfirm
            campaignId={ctx.campaignId}
            beatId={item.id}
            onOpenChange={setDeleteOpen}
          />
        ) : (
          <DeleteEntityConfirm
            campaignId={ctx.campaignId}
            target={{ kind: ctx.kind, id: item.id, name: item.name }}
            onOpenChange={setDeleteOpen}
          />
        )
      ) : null}
    </SidebarMenuItem>
  )
}

/** A beat leads with its note page; a participant leads with its kind glyph. */
function ItemIcon({ item }: { item: FolderTreeItem }) {
  if (item.iconKey === "beat") {
    return <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
  }
  return <KindIcon iconKey={item.iconKey} />
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

function flattenForest(forest: FolderForestView): MoveTargetRow[] {
  const rows: MoveTargetRow[] = []
  const walk = (folder: FolderTreeFolderView, depth: number) => {
    rows.push({ id: folder.id, name: folder.name, depth })
    for (const child of folder.folders) walk(child, depth + 1)
  }
  for (const root of forest.roots) walk(root, 0)
  return rows
}

function findFolderById(
  forest: FolderForestView,
  id: string
): FolderTreeFolderView | null {
  const walk = (folder: FolderTreeFolderView): FolderTreeFolderView | null => {
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

function subtreeIds(folder: FolderTreeFolderView): Set<string> {
  const ids = new Set<string>()
  const walk = (node: FolderTreeFolderView) => {
    ids.add(node.id)
    for (const child of node.folders) walk(child)
  }
  walk(folder)
  return ids
}

function indent(depth: number): React.CSSProperties | undefined {
  return depth === 0 ? undefined : { paddingLeft: `${depth * 0.875}rem` }
}
