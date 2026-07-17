"use client"

import {
  CaretDownIcon,
  CopyIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Panel } from "@xyflow/react"
import { useState } from "react"

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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

/**
 * The Map editor's floating page strip (UNN-586) — one tab per page in canonical
 * order, a "+" that mints a page, and a per-tab menu (Rename / Duplicate /
 * Delete). Purely presentational: pages arrive ordered, every mutation is a
 * callback the canvas owns (it alone can dispatch geometry events), and the
 * delete confirm lives on the canvas too (it carries cascade impact counts).
 * Renders as a React Flow `Panel` so it floats over the board like the
 * cartouche; hidden entirely for a readonly canvas by the host not mounting it.
 */
export interface PageTabItem {
  id: string
  name: string
}

export function CanvasPageTabs({
  pages,
  activePageId,
  onSelect,
  onAddPage,
  onRenamePage,
  onDuplicatePage,
  onRequestDelete,
}: {
  pages: PageTabItem[]
  activePageId: string
  onSelect: (pageId: string) => void
  onAddPage: () => void
  onRenamePage: (pageId: string, name: string) => void
  onDuplicatePage: (pageId: string) => void
  /** Opens the canvas's cascade-confirm dialog; disabled on the last page. */
  onRequestDelete: (pageId: string) => void
}) {
  const [renaming, setRenaming] = useState<PageTabItem | null>(null)

  return (
    <Panel
      position="top-center"
      // mt needs the important modifier: React Flow's own `.react-flow__panel`
      // margin otherwise wins the cascade and the strip lands on the cartouche.
      className="mt-20! flex max-w-[70%] items-center gap-1 overflow-x-auto rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur"
    >
      {pages.map((page) => {
        const active = page.id === activePageId
        return (
          <div
            key={page.id}
            className={cn(
              "flex shrink-0 items-center rounded-md",
              active
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(page.id)}
              aria-current={active ? "page" : undefined}
              className="max-w-40 truncate px-2 py-1 text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              {page.name}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Page actions for ${page.name}`}
                className="rounded-md p-1 opacity-60 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                <CaretDownIcon className="size-3" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setRenaming(page)}>
                  <PencilSimpleIcon />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicatePage(page.id)}>
                  <CopyIcon />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={pages.length <= 1}
                  onClick={() => onRequestDelete(page.id)}
                >
                  <TrashIcon />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="New page"
        className="shrink-0"
        onClick={onAddPage}
      >
        <PlusIcon />
      </Button>

      <RenamePageDialog
        page={renaming}
        onClose={() => setRenaming(null)}
        onRename={onRenamePage}
      />
    </Panel>
  )
}

/** The one rename-page prompt — shared by the editor's tab menu and the console's
 *  Pages sidebar (a controlled dialog around a single name field). */
export function RenamePageDialog({
  page,
  onClose,
  onRename,
}: {
  page: PageTabItem | null
  onClose: () => void
  onRename: (pageId: string, name: string) => void
}) {
  function handleSubmit(formData: FormData) {
    if (!page) return
    const name = formData.get("name")
    if (typeof name === "string" && name.trim().length > 0) {
      onRename(page.id, name)
    }
    onClose()
  }

  return (
    <Dialog open={page !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename page</DialogTitle>
          <DialogDescription className="sr-only">
            Set a new name for this page.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          {/* key remounts the input per page so defaultValue re-seeds */}
          <Input
            key={page?.id}
            name="name"
            defaultValue={page?.name}
            autoFocus
            aria-label="Page name"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Rename</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
