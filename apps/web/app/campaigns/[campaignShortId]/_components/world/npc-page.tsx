"use client"

import { MaskHappyIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter, useSearchParams } from "next/navigation"
import { useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import { DocumentEditor } from "@/components/editor/document-editor"
import { NUMERIC_TIER_LABELS } from "@/domain/labels"
import { BOND_THRESHOLD, MAX_BOND_TIER } from "@/domain/planner/bond"
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
import type { TimelineDayView } from "@/domain/planner/view/timeline"
import type { RelationRowView } from "@/domain/planner/view/world-detail"
import type { Lineage, NarrativeTextField } from "@/domain/vocab"
import { campaignNpcsPath } from "@/lib/paths"

import { ArcanaPicker } from "./arcana-picker"
import { BondTierPicker } from "./bond-tier-picker"
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
  /** Derived distinct-PC-days toward the next tier (UNN-581, D8); null while
   *  the NPC holds no Lineage (bond machinery inactive). */
  bondProgress: number | null
  /** The eight text fields, nulls flattened to "" for the editors. */
  narrative: Record<NarrativeTextField, string>
  folderName: string | null
  isStub: boolean
}

/** What the Overview pane renders besides the pickers. */
export interface NpcPageWeb {
  relations: RelationRowView[]
  timeline: TimelineDayView[]
  beatMentions: number
  currentDay: number | null
}

type NpcPane = "overview" | NarrativeTextField

/**
 * The NPC page (UNN-579 work items 2+3): one pane at a time — Overview
 * (trait pickers, relations, mention count, composer, timeline) or a single
 * `narrative` document in a full-height editor (the builder's animus
 * experience, mirrored because feature isolation forbids importing it). The
 * document rail itself lives in the **world shell's sidebar**
 * (`WorldDocRail` — the master-detail drill-down), and both sides agree on
 * the open pane through `?doc=`. Narrative saves are per-field LWW (D10 —
 * deliberately not the entity door; see `saveNpcNarrativeField`).
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
              {npc.lineageKey !== null ? (
                <>
                  <BondTierPicker
                    campaignId={campaignId}
                    entityId={npc.entityId}
                    npcName={displayName}
                    tier={npc.bondTier}
                  />
                  {npc.bondProgress !== null && npc.bondTier < MAX_BOND_TIER ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {Math.min(npc.bondProgress, BOND_THRESHOLD)}/
                      {BOND_THRESHOLD} toward{" "}
                      {NUMERIC_TIER_LABELS[npc.bondTier + 1]}
                    </span>
                  ) : null}
                </>
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
