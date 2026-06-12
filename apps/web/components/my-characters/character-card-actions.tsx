"use client"

import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { DeleteCharacterDialog } from "./delete-character-dialog"

interface CharacterCardActionsProps {
  characterId: string
  /**
   * The character's actual `name` column — possibly empty for an unnamed
   * draft. Passed through to {@link DeleteCharacterDialog} which branches
   * on emptiness to pick the confirm flow (UNN-219).
   */
  name: string
  /**
   * The resolved label used in the dropdown's aria-label. Always non-empty
   * (the card falls back to "New draft" for unnamed drafts).
   */
  displayName: string
  /**
   * Primary-button destination. Finalized characters point at the public
   * sheet (`/c/{shortId}`); drafts point at the builder so the player
   * resumes mid-flow.
   */
  href: string
  /** Primary-button label — typically "Open" or "Resume building". */
  primaryLabel: string
}

/**
 * The split button on a character card. The primary half routes to the
 * caller-supplied `href` (the sheet for finalized rows, the builder for
 * drafts; the card computes which). The trailing half opens a menu with
 * Edit / Duplicate / Share / Delete. Edit, Duplicate, and Share remain
 * disabled until their per-action tickets land; Delete opens
 * {@link DeleteCharacterDialog}, which renders the simple discard confirm
 * for unnamed drafts and the type-to-confirm flow for named rows.
 */
export function CharacterCardActions({
  characterId,
  name,
  displayName,
  href,
  primaryLabel,
}: CharacterCardActionsProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <ButtonGroup>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={href} />}
        >
          {primaryLabel}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={`Actions for ${displayName}`}
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
