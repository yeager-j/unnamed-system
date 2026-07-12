"use client"

import {
  CaretDownIcon,
  CaretRightIcon,
  DotsThreeIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  MoonStarsIcon,
  NotePencilIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
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
  filterNotesTree,
  type NotesTreeFolderView,
} from "@/domain/planner/view/notes-tree"

import { ScheduleGlyph } from "./schedule-control"

/**
 * The Session Notes sidebar tree (handoff Screen 3): folders are sessions,
 * notes are beats, Unfiled is virtual. Header carries the day pill + the
 * new-folder / new-beat actions; the search input is a client-side title
 * filter (body FTS is a deferred fast-follow). Folder rows collapse locally;
 * a folder's ⋯ menu renames or deletes it (beats float to Unfiled — the
 * confirm says so).
 */
export function NotesTree({
  dayLine,
  campaignName,
  folders,
  selectedBeatId,
  onSelectBeat,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onCreateBeat,
}: {
  dayLine: string | null
  campaignName: string
  folders: NotesTreeFolderView[]
  selectedBeatId: string | null
  onSelectBeat: (beatId: string) => void
  onCreateSession: (name: string) => void
  onRenameSession: (sessionId: string, name: string) => void
  onDeleteSession: (sessionId: string) => void
  /** Creates a beat in `sessionId` (null ⇒ Unfiled). */
  onCreateBeat: (sessionId: string | null) => void
}) {
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string | null>>(new Set())
  const [newFolderOpen, setNewFolderOpen] = useState(false)

  const visible = filterNotesTree(folders, query)
  const selectedFolder =
    folders.find((folder) =>
      folder.beats.some((beat) => beat.id === selectedBeatId)
    ) ?? null

  const toggle = (sessionId: string | null) =>
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })

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
          <span className="flex-1 text-sm font-semibold">Session Notes</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New session folder"
            onClick={() => setNewFolderOpen(true)}
          >
            <FolderPlusIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New beat"
            onClick={() => onCreateBeat(selectedFolder?.sessionId ?? null)}
          >
            <NotePencilIcon />
          </Button>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes…"
          aria-label="Search notes"
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {folders.length === 0 ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">
                Prep lives here: folders are sessions, notes are beats. Create a
                beat to get started.
              </p>
            ) : visible.length === 0 ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">
                Nothing matches &ldquo;{query.trim()}&rdquo;.
              </p>
            ) : (
              visible.map((folder) => (
                <FolderRows
                  key={folder.sessionId ?? "__unfiled"}
                  folder={folder}
                  isCollapsed={collapsed.has(folder.sessionId)}
                  selectedBeatId={selectedBeatId}
                  onToggle={() => toggle(folder.sessionId)}
                  onSelectBeat={onSelectBeat}
                  onRename={(name) =>
                    folder.sessionId !== null &&
                    onRenameSession(folder.sessionId, name)
                  }
                  onDelete={() =>
                    folder.sessionId !== null &&
                    onDeleteSession(folder.sessionId)
                  }
                />
              ))
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {newFolderOpen ? (
        <NameDialog
          title="New session folder"
          description="Sessions group beats — purely organizational, never tied to the clock."
          confirmLabel="Create"
          initialValue=""
          placeholder="Session 9 — Into the Fens"
          onOpenChange={setNewFolderOpen}
          onSubmit={onCreateSession}
        />
      ) : null}
    </>
  )
}

function FolderRows({
  folder,
  isCollapsed,
  selectedBeatId,
  onToggle,
  onSelectBeat,
  onRename,
  onDelete,
}: {
  folder: NotesTreeFolderView
  isCollapsed: boolean
  selectedBeatId: string | null
  onToggle: () => void
  onSelectBeat: (beatId: string) => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const isUnfiled = folder.sessionId === null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="group/folder flex items-center">
          <SidebarMenuButton onClick={onToggle} className="flex-1 font-medium">
            {isCollapsed ? (
              <CaretRightIcon className="size-3.5 shrink-0" />
            ) : (
              <CaretDownIcon className="size-3.5 shrink-0" />
            )}
            <FolderIcon className="size-4 shrink-0" />
            <span className="truncate">{folder.name}</span>
          </SidebarMenuButton>
          {isUnfiled ? null : (
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
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  Delete session…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </SidebarMenuItem>
      {isCollapsed
        ? null
        : folder.beats.map((beat) => (
            <SidebarMenuItem key={beat.id} className="pl-5">
              <SidebarMenuButton
                isActive={beat.id === selectedBeatId}
                onClick={() => onSelectBeat(beat.id)}
              >
                <FileTextIcon className="size-4 shrink-0" />
                <span
                  className={cn(
                    "flex-1 truncate",
                    beat.title === "Untitled beat" && "text-muted-foreground"
                  )}
                >
                  {beat.title}
                </span>
                {beat.scheduleIcon === "none" ? null : (
                  <span title={beat.scheduleLabel ?? undefined}>
                    <ScheduleGlyph
                      kind={beat.scheduleIcon}
                      className={cn(
                        "size-3.5",
                        beat.scheduleIcon === "scheduled" && "text-primary-text"
                      )}
                    />
                  </span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
      {renameOpen ? (
        <NameDialog
          title="Rename session"
          description="Renames the folder — its beats stay put."
          confirmLabel="Rename"
          initialValue={folder.name}
          onOpenChange={setRenameOpen}
          onSubmit={onRename}
        />
      ) : null}
      {deleteOpen ? (
        <AlertDialog open onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {folder.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Its beats aren&apos;t deleted — they move to Unfiled.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setDeleteOpen(false)
                  onDelete()
                }}
              >
                Delete session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </SidebarMenu>
  )
}

/**
 * One text-input dialog for folder names, mounted only while open (the
 * runner's `LabelDialog` reasoning: an SSR'd closed Base UI dialog desyncs
 * hydration ids, and mount-on-open is cheaper anyway).
 */
function NameDialog({
  title,
  description,
  confirmLabel,
  initialValue,
  placeholder,
  onOpenChange,
  onSubmit,
}: {
  title: string
  description: string
  confirmLabel: string
  initialValue: string
  placeholder?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => void
}) {
  const [value, setValue] = useState(initialValue)

  const submit = () => {
    const name = value.trim()
    if (!name) return
    onSubmit(name)
    onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="session-name">Name</Label>
          <Input
            id="session-name"
            value={value}
            placeholder={placeholder}
            maxLength={200}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit()
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
