"use client"

import {
  CalendarBlankIcon,
  FlagIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"

import { DocumentEditor } from "@/components/editor/document-editor"
import type { ParticipantRef } from "@/domain/planner/participant"
import { useArticleAutoSave } from "@/domain/planner/use-article-autosave"
import type { LinkerOption } from "@/domain/planner/view/linker"
import type { TimelineDayView } from "@/domain/planner/view/timeline"
import type { RelationRowView } from "@/domain/planner/view/world-detail"
import type { ArticleDatedKind } from "@/lib/db/schema/campaign-world"
import { campaignArticlesPath } from "@/lib/paths"

import {
  createParticipantLinkExtensions,
  createParticipantLinkWorld,
  participantWorldSnapshot,
} from "../notes/participant-links"
import { ArticleTypePicker } from "./article-type-picker"
import { DeleteEntityConfirm } from "./delete-entity-confirm"
import { EntityWebSections } from "./entity-web-sections"
import { useWorldNameMirror } from "./world-shell"

/** The page's serialized slice of a loaded article. */
export interface ArticlePageArticle {
  id: string
  name: string
  body: string
  type: string | null
  datedDay: number | null
  datedKind: ArticleDatedKind | null
  folderName: string | null
}

/**
 * The Article page (UNN-579 work item 2): the document — name + chip-capable
 * markdown body autosaving LWW (D10, no revalidation; the rail row keeps up
 * through the shell's name mirror) — over the world-web sections. The dated
 * facet renders as a read-only chip (the Calendar owns date edits).
 */
export function ArticlePage({
  campaignId,
  campaignShortId,
  article,
  typeOptions,
  linkerOptions,
  relations,
  timeline,
  beatMentions,
  currentDay,
}: {
  campaignId: string
  campaignShortId: string
  article: ArticlePageArticle
  typeOptions: string[]
  linkerOptions: LinkerOption[]
  relations: RelationRowView[]
  timeline: TimelineDayView[]
  beatMentions: number
  currentDay: number | null
}) {
  const router = useRouter()
  const mirrorName = useWorldNameMirror()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const fields = useArticleAutoSave({
    campaignId,
    articleId: article.id,
    serverName: article.name,
    serverBody: article.body,
  })

  const world = useMemo(
    () => createParticipantLinkWorld(participantWorldSnapshot(linkerOptions)),
    []
  )
  useEffect(() => {
    world.replace(participantWorldSnapshot(linkerOptions))
  }, [linkerOptions, world])
  const extensions = useMemo(
    () =>
      createParticipantLinkExtensions({
        campaignId,
        campaignShortId,
        world,
        navigate: router.push,
      }),
    [campaignId, campaignShortId, world, router]
  )

  const self: ParticipantRef = { kind: "article", id: article.id }
  const displayName =
    fields.name.value.trim() === "" ? "Untitled article" : fields.name.value

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="min-w-0 truncate">
          {article.folderName ?? "Unfiled"}
          <span className="mx-1.5">›</span>
          {displayName}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {article.datedDay !== null ? (
            <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs">
              {article.datedKind === "deadline" ? (
                <FlagIcon className="size-3.5 text-gold" />
              ) : (
                <CalendarBlankIcon className="size-3.5" />
              )}
              Day {article.datedDay}
            </span>
          ) : null}
          <ArticleTypePicker
            campaignId={campaignId}
            articleId={article.id}
            value={article.type}
            options={typeOptions}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete article"
            className="text-muted-foreground"
            onClick={() => setDeleteOpen(true)}
          >
            <TrashIcon />
          </Button>
        </div>
      </div>

      <DocumentEditor
        documentId={article.id}
        title={{
          ...fields.name,
          setValue: (next) => {
            fields.name.setValue(next)
            mirrorName(article.id, next)
          },
        }}
        body={fields.body}
        extensions={extensions}
        messages={{
          titlePlaceholder: "Untitled article",
          bodyAriaLabel: "Article body",
          bodyPlaceholder:
            "The page. Type @ or [[ to link an NPC, Article, or character.",
        }}
      />

      <EntityWebSections
        campaignId={campaignId}
        campaignShortId={campaignShortId}
        self={self}
        selfLabel={displayName}
        relations={relations}
        timeline={timeline}
        beatMentions={beatMentions}
        currentDay={currentDay}
        linkerOptions={linkerOptions}
      />

      {deleteOpen ? (
        <DeleteEntityConfirm
          campaignId={campaignId}
          target={{ kind: "article", id: article.id, name: displayName }}
          onOpenChange={setDeleteOpen}
          onDeleted={() =>
            router.replace(campaignArticlesPath(campaignShortId))
          }
        />
      ) : null}
    </div>
  )
}
