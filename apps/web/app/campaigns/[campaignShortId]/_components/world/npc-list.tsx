"use client"

import { PlusIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useState, useTransition } from "react"
import { toast } from "sonner"

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
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"

import type { LinkerOption } from "@/domain/planner/view/linker"
import type { NpcListRowView } from "@/domain/planner/view/world"
import { deleteNpcAction } from "@/lib/actions/campaign-world/delete-npc"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

import { KindIcon, ParticipantLinker } from "./participant-linker"

/**
 * The NPCs list (UNN-575's thin world surface): name, authored traits, the
 * **Stub** badge for quick-minted rows, delete-with-confirm, and the "New
 * NPC" button opening the {@link ParticipantLinker} (its quick-mint rows are
 * the mint path). Full entity pages (trait pickers, Identity/Origins prose)
 * land in phase 6 — this list is the phase-2 home for "it exists and can be
 * referenced."
 */
export function NpcList({
  campaignId,
  rows,
  linkerOptions,
}: {
  campaignId: string
  rows: NpcListRowView[]
  linkerOptions: LinkerOption[]
}) {
  const [confirming, setConfirming] = useState<NpcListRowView | null>(null)
  const [isPending, startTransition] = useTransition()

  function onDelete() {
    if (!confirming) return
    const npc = confirming
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await deleteNpcAction({
            campaignId,
            entityId: npc.entityId,
          })
          if (result.ok) {
            setConfirming(null)
            toast.success(`${npc.name} removed from the world.`)
            return
          }
          toast.error(`Couldn't delete ${npc.name}. Try again.`)
        },
        () => toast.error(`Couldn't delete ${npc.name}. Try again.`)
      )
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "No NPCs yet — mint the ones you already know."
            : `${rows.length} in the world web`}
        </p>
        <ParticipantLinker
          campaignId={campaignId}
          options={linkerOptions}
          trigger={
            <Button size="sm">
              <PlusIcon weight="bold" />
              New NPC
            </Button>
          }
        />
      </div>

      <ItemGroup className="gap-1">
        {rows.map((npc) => (
          <Item key={npc.entityId} variant="outline" size="sm">
            <ItemMedia>
              <KindIcon iconKey="npc" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                {npc.name}
                {npc.isStub ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Stub
                  </Badge>
                ) : null}
              </ItemTitle>
              {npc.traits === null ? null : (
                <ItemDescription>{npc.traits}</ItemDescription>
              )}
            </ItemContent>
            <ItemActions>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${npc.name}`}
                className="text-muted-foreground"
                onClick={() => setConfirming(npc)}
              >
                <TrashIcon className="size-4" />
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>

      {/* Mounted only while open: an SSR'd closed Base UI overlay still consumes
          a server id slot and desyncs downstream ids (lesson 2026-07-11). */}
      {confirming === null ? null : (
        <AlertDialog
          open
          onOpenChange={(next) => {
            if (!next) setConfirming(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {confirming?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Referenced nowhere yet. Anywhere the world web mentions{" "}
                {confirming?.name} later will keep the name, muted — but the NPC
                leaves the linker and this list, and any assigned Lineage
                returns to the deck.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} disabled={isPending}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
