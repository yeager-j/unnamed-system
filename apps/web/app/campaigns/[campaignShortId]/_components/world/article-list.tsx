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
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"

import type { LinkerOption } from "@/domain/planner/view/linker"
import type { ArticleListRowView } from "@/domain/planner/view/world"
import { deleteArticleAction } from "@/lib/actions/campaign-world/delete-article"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

import { KindIcon, ParticipantLinker } from "./participant-linker"

/**
 * The Articles list (UNN-575's thin world surface): name, the label-only
 * `type` chip, and delete-with-confirm. Full article pages (prose, dates,
 * relations) land in later phases.
 */
export function ArticleList({
  campaignId,
  rows,
  linkerOptions,
}: {
  campaignId: string
  rows: ArticleListRowView[]
  linkerOptions: LinkerOption[]
}) {
  const [confirming, setConfirming] = useState<ArticleListRowView | null>(null)
  const [isPending, startTransition] = useTransition()

  function onDelete() {
    if (!confirming) return
    const article = confirming
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await deleteArticleAction({
            campaignId,
            articleId: article.id,
          })
          if (result.ok) {
            setConfirming(null)
            toast.success(`${article.name} removed from the world.`)
            return
          }
          toast.error(`Couldn't delete ${article.name}. Try again.`)
        },
        () => toast.error(`Couldn't delete ${article.name}. Try again.`)
      )
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "No Articles yet — places, factions, threats, lore."
            : `${rows.length} in the world web`}
        </p>
        <ParticipantLinker
          campaignId={campaignId}
          options={linkerOptions}
          trigger={
            <Button size="sm">
              <PlusIcon weight="bold" />
              New Article
            </Button>
          }
        />
      </div>

      <ItemGroup className="gap-1">
        {rows.map((article) => (
          <Item key={article.id} variant="outline" size="sm">
            <ItemMedia>
              <KindIcon iconKey={article.iconKey} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                {article.name}
                {article.type === null ? null : (
                  <Badge variant="outline" className="text-muted-foreground">
                    {article.type}
                  </Badge>
                )}
              </ItemTitle>
            </ItemContent>
            <ItemActions>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${article.name}`}
                className="text-muted-foreground"
                onClick={() => setConfirming(article)}
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
                {confirming?.name} later will keep the name, muted — but the
                Article leaves the linker and this list.
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
