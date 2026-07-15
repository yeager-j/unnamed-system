"use client"

import {
  CalendarIcon,
  FlagBannerIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

import { setArticleDateAction } from "@/lib/actions/campaign-world/article-date"
import { mintArticleAction } from "@/lib/actions/campaign-world/mint-article"
import type { ArticleDatedKind } from "@/lib/db/schema/campaign-world"

import { useCalendarWrite } from "./use-calendar-write"

/** An undated article the picker can date onto this day. */
export interface DatableArticle {
  id: string
  name: string
  type: string | null
}

/**
 * The day card's "+ Event / + Deadline" quick-create (FR-8): pick an
 * existing undated Article or quick-mint a name-only stub, then date it onto
 * this day — mint and date are two composed actions (a failure between them
 * leaves an ordinary undated Article, harmless). A day with dated lines
 * collapses the two pills into one "+" menu.
 */
export function QuickCreate({
  campaignId,
  day,
  articles,
  compact,
}: {
  campaignId: string
  day: number
  articles: DatableArticle[]
  compact: boolean
}) {
  const [kind, setKind] = useState<ArticleDatedKind | null>(null)

  const pill =
    "inline-flex h-6 items-center gap-1 rounded-full border border-dashed px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-gold hover:text-gold"

  return (
    <>
      {compact ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className={pill}
                aria-label={`Add an event or deadline on Day ${day}`}
              />
            }
          >
            <PlusIcon className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48" align="start">
            <DropdownMenuItem onClick={() => setKind("event")}>
              <CalendarIcon className="text-gold" /> Add an event…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setKind("deadline")}>
              <FlagBannerIcon className="text-destructive" /> Add a deadline…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="flex gap-1.5">
          <button
            type="button"
            className={pill}
            aria-label={`Add an event on Day ${day}`}
            onClick={() => setKind("event")}
          >
            <PlusIcon className="size-3" /> Event
          </button>
          <button
            type="button"
            className={pill}
            aria-label={`Add a deadline on Day ${day}`}
            onClick={() => setKind("deadline")}
          >
            <PlusIcon className="size-3" /> Deadline
          </button>
        </div>
      )}
      {kind !== null ? (
        <QuickCreateDialog
          campaignId={campaignId}
          day={day}
          kind={kind}
          articles={articles}
          onOpenChange={(open) => {
            if (!open) setKind(null)
          }}
        />
      ) : null}
    </>
  )
}

function QuickCreateDialog({
  campaignId,
  day,
  kind,
  articles,
  onOpenChange,
}: {
  campaignId: string
  day: number
  kind: ArticleDatedKind
  articles: DatableArticle[]
  onOpenChange: (open: boolean) => void
}) {
  const { run } = useCalendarWrite()
  const [query, setQuery] = useState("")

  const trimmed = query.trim()
  const matches = articles
    .filter((article) =>
      article.name.toLowerCase().includes(trimmed.toLowerCase())
    )
    .slice(0, 6)

  const date = (articleId: string) =>
    run(
      () => setArticleDateAction({ campaignId, articleId, day, kind }),
      () => onOpenChange(false)
    )

  const mintAndDate = () =>
    run(
      async () => {
        const minted = await mintArticleAction({ campaignId, name: trimmed })
        if (!minted.ok) return minted
        return setArticleDateAction({
          campaignId,
          articleId: minted.value.id,
          day,
          kind,
        })
      },
      () => onOpenChange(false)
    )

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === "deadline"
              ? `Add a deadline — Day ${day}`
              : `Add an event — Day ${day}`}
          </DialogTitle>
          <DialogDescription>
            {kind === "deadline"
              ? "The dated Article is the threat itself; the villain behind it stays a linked participant. Time can't move past its day until it's resolved."
              : "Flavor on the day — inert, gold, and there when the party asks what's going on in town."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Input
            autoFocus
            value={query}
            placeholder="Find an article or name something new"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              if (matches.length > 0) date(matches[0]!.id)
              else if (trimmed !== "") mintAndDate()
            }}
          />
          <div className="flex flex-col gap-0.5">
            {matches.map((article) => (
              <Button
                key={article.id}
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => date(article.id)}
              >
                <span className="truncate">{article.name}</span>
                {article.type ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {article.type}
                  </span>
                ) : null}
              </Button>
            ))}
            {trimmed !== "" ? (
              <Button
                variant="ghost"
                size="sm"
                className="justify-start text-gold"
                onClick={mintAndDate}
              >
                <PlusIcon />
                Create “{trimmed}”
              </Button>
            ) : null}
            {matches.length === 0 && trimmed === "" ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                Type to search the campaign&apos;s articles or mint a new one.
              </p>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
