"use client"

import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useState } from "react"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

import { DeleteCharacterDialog } from "./delete-character-dialog"

interface CharacterCardActionsProps {
  characterId: string
  shortId: string
  name: string
}

/**
 * The split button on a character card. The primary half routes to the
 * character sheet (owner-edit + public view share `/c/{shortId}`; the sheet
 * itself decides what the viewer can do). The trailing half opens a menu
 * with Edit / Duplicate / Share / Delete. Edit, Duplicate, and Share remain
 * disabled until their per-action tickets land; Delete opens the
 * type-to-confirm {@link DeleteCharacterDialog} (UNN-181).
 */
export function CharacterCardActions({
  characterId,
  shortId,
  name,
}: CharacterCardActionsProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <ButtonGroup>
        <Link
          href={`/c/${shortId}`}
          data-slot="button"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Open
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={`Actions for ${name}`}
              >
                <CaretDownIcon weight="bold" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>Edit</DropdownMenuItem>
            <DropdownMenuItem disabled>Duplicate</DropdownMenuItem>
            <DropdownMenuItem disabled>Share</DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDialogOpen(true)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <DeleteCharacterDialog
        characterId={characterId}
        name={name}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}
