"use client"

import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

interface CharacterCardActionsProps {
  shortId: string
  name: string
}

/**
 * The split button on a character card. The primary half routes to the
 * character sheet (owner-edit + public view share `/c/{shortId}`; the sheet
 * itself decides what the viewer can do). The trailing half opens a menu
 * with Edit / Duplicate / Share / Delete — all disabled at MVP per UNN-177;
 * the affordance exists so it is reachable when the per-action tickets land.
 */
export function CharacterCardActions({
  shortId,
  name,
}: CharacterCardActionsProps) {
  return (
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
          <DropdownMenuItem disabled variant="destructive">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}
