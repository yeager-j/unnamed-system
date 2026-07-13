"use client"

import { MaskHappyIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter, useSearchParams } from "next/navigation"
import { useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import { DocumentEditor } from "@/components/editor/document-editor"
import {
  NPC_DOCUMENT_MESSAGES,
  npcPaneFromParam,
} from "@/domain/planner/npc-documents"
import type { ParticipantRef } from "@/domain/planner/participant"
import {
  useNpcNameAutoSave,
  useNpcNarrativeAutoSave,
} from "@/domain/planner/use-npc-autosave"
import type { LinkerOption } from "@/domain/planner/view/linker"
import type {
  EntityTimelineDayView,
  RelationRowView,
} from "@/domain/planner/view/world-detail"
import type { Lineage, NarrativeTextField } from "@/domain/vocab"
import { campaignNpcsPath } from "@/lib/paths"

import { ArcanaPicker } from "./arcana-picker"
import { DeleteEntityConfirm } from "./delete-entity-confirm"
import { EntityWebSections } from "./entity-web-sections"
import { LineagePicker } from "./lineage-picker"
import { useWorldNameMirror } from "./world-shell"

/** The page's serialized slice of a loaded NPC. */
export interface NpcPageNpc {
  entityId: string
  name: string
  arcana: string | null
  lineageKey: Lineage | null
  bondTier: number
  /** The eight text fields, nulls flattened to "" for the editors. */
  narrative: Record<NarrativeTextField, string>
  folderName: string | null
  isStub: boolean
}

/** What the Overview pane renders besides the pickers. */
export interface NpcPageWeb {
  relations: RelationRowView[]
  timeline: EntityTimelineDayView[]
  beatMentions: number
  currentDay: number | null
}

type NpcPane = "overview" | NarrativeTextField

/**
 * The NPC page (UNN-579 work items 2+3): a persistent header (name autosave
 * + Stub badge) over the **document rail** — the builder's animus experience
 * (one field at a time in a full-height editor), mirrored here because
 * feature isolation forbids importing it. The Overview pane carries the
 * trait pickers, relations, mention count, composer, and timeline;
 * Origins/Identity panes edit one `narrative` field each, per-field LWW
 * (D10 — deliberately not the entity door; see `saveNpcNarrativeField`).
 *
 * The rail is a **plain two-column layout**, not a nested `SidebarProvider`
 * — nesting one inside the world shell's provider desyncs Base UI's
 * hydration ids across the whole page subtree (verified against the Article
 * page, which shares everything but the nesting), and the rail needs none
 * of the sidebar machinery anyway (no collapse, no mobile sheet).
 *
 * Narrative fields take **no chip extensions**: the component is shared with
 * PCs and renders through the sheet's plain `Prose` pipeline, where a chip
 * token would surface as raw text.
 */
export function NpcPage({
  campaignId,
  campaignShortId,
  npc,
  lineageHolders,
  arcanaHolders,
  linkerOptions,
  web,
}: {
  campaignId: string
  campaignShortId: string
  npc: NpcPageNpc
  /** Lineage → holder name, this NPC excluded (server-shaped). */
  lineageHolders: Record<string, string>
  /** Arcana label → holder name, this NPC excluded (server-shaped). */
  arcanaHolders: Record<string, string>
  linkerOptions: LinkerOption[]
  web: NpcPageWeb
}) {
  const router = useRouter()
  const mirrorName = useWorldNameMirror()
  const searchParams = useSearchParams()
  const pane: NpcPane = npcPaneFromParam(searchParams.get("doc"))
  const [deleteOpen, setDeleteOpen] = useState(false)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const name = useNpcNameAutoSave({
    campaignId,
    entityId: npc.entityId,
    serverName: npc.name,
    saveQueueRef,
  })

  const displayName = name.value.trim() === "" ? "Unnamed NPC" : name.value
  const self: ParticipantRef = { kind: "npc", id: npc.entityId }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-6 py-3 text-sm text-muted-foreground">
        {npc.isStub ? (
          <span
            className="shrink-0 opacity-40"
            title="Stub — a name and nothing else yet"
          >
            <MaskHappyIcon className="size-4" />
          </span>
        ) : null}
        <span className="min-w-0 truncate">
          {npc.folderName ?? "Unfiled"}
          <span className="mx-1.5">›</span>
          {displayName}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete NPC"
          className="ml-auto shrink-0 text-muted-foreground"
          onClick={() => setDeleteOpen(true)}
        >
          <TrashIcon />
        </Button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {pane === "overview" ? (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
            <Input
              type="text"
              autoComplete="off"
              aria-label="NPC name"
              placeholder="Unnamed NPC"
              value={name.value}
              onChange={(event) => {
                name.setValue(event.target.value)
                mirrorName(npc.entityId, event.target.value)
              }}
              onFocus={() => name.onFocusChange(true)}
              onBlur={() => name.onFocusChange(false)}
              className="h-auto rounded-none border-0 bg-transparent px-0 font-display text-2xl font-semibold text-foreground shadow-none placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0 sm:text-3xl md:text-3xl dark:bg-transparent"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <ArcanaPicker
                campaignId={campaignId}
                entityId={npc.entityId}
                value={npc.arcana}
                holders={new Map(Object.entries(arcanaHolders))}
              />
              <LineagePicker
                campaignId={campaignId}
                entityId={npc.entityId}
                value={npc.lineageKey}
                holders={
                  new Map(Object.entries(lineageHolders) as [Lineage, string][])
                }
              />
              {npc.bondTier > 0 ? (
                <span className="rounded-full border px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
                  Bond {npc.bondTier}
                </span>
              ) : null}
            </div>
            <EntityWebSections
              campaignId={campaignId}
              campaignShortId={campaignShortId}
              self={self}
              selfLabel={displayName}
              relations={web.relations}
              timeline={web.timeline}
              beatMentions={web.beatMentions}
              currentDay={web.currentDay}
              linkerOptions={linkerOptions}
            />
          </div>
        ) : (
          <NpcFieldPane
            key={pane}
            campaignId={campaignId}
            entityId={npc.entityId}
            field={pane}
            serverValue={npc.narrative[pane]}
            saveQueueRef={saveQueueRef}
          />
        )}
      </div>

      {deleteOpen ? (
        <DeleteEntityConfirm
          campaignId={campaignId}
          target={{ kind: "npc", id: npc.entityId, name: displayName }}
          onOpenChange={setDeleteOpen}
          onDeleted={() => router.replace(campaignNpcsPath(campaignShortId))}
        />
      ) : null}
    </div>
  )
}

/** One narrative field, full-height — the animus writer-pane shape. */
function NpcFieldPane({
  campaignId,
  entityId,
  field,
  serverValue,
  saveQueueRef,
}: {
  campaignId: string
  entityId: string
  field: NarrativeTextField
  serverValue: string
  saveQueueRef: React.RefObject<Promise<void>>
}) {
  const messages = NPC_DOCUMENT_MESSAGES[field]
  const body = useNpcNarrativeAutoSave({
    campaignId,
    entityId,
    field,
    serverValue,
    saveQueueRef,
  })

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col p-6">
      <DocumentEditor
        documentId={`${entityId}-${field}`}
        title={{
          value: messages.label,
          setValue: () => {},
          onFocusChange: () => {},
        }}
        titleReadOnly
        body={body}
        messages={{
          bodyAriaLabel: `${messages.label} prose`,
          bodyPlaceholder: messages.placeholder,
        }}
      />
    </div>
  )
}
