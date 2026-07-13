"use client"

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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import {
  countFolderContents,
  type WorldTreeFolderView,
} from "@/domain/planner/view/world-tree"

/**
 * One text-input dialog for folder and entity names, mounted only while open
 * (the notes-tree `NameDialog` reasoning: an SSR'd closed Base UI dialog
 * desyncs hydration ids, and mount-on-open is cheaper anyway).
 */
export function NameDialog({
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
          <Label htmlFor="world-name">Name</Label>
          <Input
            id="world-name"
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

/**
 * The folder delete confirm (D11): counts the subtree so the copy is honest —
 * descendant folders die with it, contained items float to Unfiled.
 */
export function DeleteFolderDialog({
  folder,
  onOpenChange,
  onDelete,
}: {
  folder: WorldTreeFolderView
  onOpenChange: (open: boolean) => void
  onDelete: () => void
}) {
  const counts = countFolderContents(folder)
  const contents = [
    counts.folders > 0
      ? `${counts.folders} nested folder${counts.folders === 1 ? "" : "s"}`
      : null,
    counts.items > 0
      ? `${counts.items} entr${counts.items === 1 ? "y" : "ies"}`
      : null,
  ].filter((part): part is string => part !== null)

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {folder.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {contents.length === 0
              ? "The folder is empty."
              : `It holds ${contents.join(" and ")}. Nested folders are deleted too; nothing inside is lost — every entry moves to Unfiled.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false)
              onDelete()
            }}
          >
            Delete folder
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
