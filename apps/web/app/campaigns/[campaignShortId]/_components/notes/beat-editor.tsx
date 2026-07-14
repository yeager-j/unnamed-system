"use client"

import { TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"

import { DocumentEditor } from "@/components/editor/document-editor"
import { useBeatAutoSave } from "@/domain/planner/use-beat-autosave"
import type { LinkerOption } from "@/domain/planner/view/linker"
import { UNTITLED_BEAT_LABEL } from "@/domain/planner/view/notes"
import type { SchedulePickerDayView } from "@/domain/planner/view/schedule-picker"
import { campaignNotesPath } from "@/lib/paths"

import { useFolderTreeNameMirror } from "../folder-tree/folder-tree-shell"
import { DeleteBeatConfirm } from "./delete-beat-confirm"
import {
  createParticipantLinkExtensions,
  createParticipantLinkWorld,
  participantWorldSnapshot,
} from "./participant-links"
import { ScheduleControl, type ScheduleState } from "./schedule-control"

/** The editor's slice of a loaded beat (serialized server → client). */
export interface BeatEditorBeat {
  id: string
  title: string
  tagline: string
  body: string
  folderName: string | null
  schedule: ScheduleState
}

/**
 * The beat editor (handoff Screen 3): breadcrumb, display-font title,
 * tagline, the schedule control, and the chip-capable markdown body. All
 * three text fields autosave through {@link useBeatAutoSave} (~800 ms, flush
 * on blur, one queue per beat — no revalidation, D10); the body's `@`/`[[`
 * triggers summon the participant chip completions (D7). Title keystrokes
 * ride the layout-owned name mirror so the tree row keeps up without one.
 */
export function BeatEditor({
  campaignId,
  campaignShortId,
  beat,
  linkerOptions,
  scheduleDays,
  clockStarted,
}: {
  campaignId: string
  campaignShortId: string
  beat: BeatEditorBeat
  linkerOptions: LinkerOption[]
  scheduleDays: SchedulePickerDayView[]
  clockStarted: boolean
}) {
  const router = useRouter()
  const mirrorName = useFolderTreeNameMirror()
  const fields = useBeatAutoSave({
    campaignId,
    beatId: beat.id,
    serverTitle: beat.title,
    serverTagline: beat.tagline,
    serverBody: beat.body,
  })

  // The editor instance is long-lived: the chip layer is created once against
  // a stable world store, and fresh linker options flow in through the store's
  // `replace` rather than a remount.
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="min-w-0 truncate">
          {beat.folderName ?? "Unfiled"}
          <span className="mx-1.5">›</span>
          {fields.title.value.trim() === ""
            ? "Untitled beat"
            : fields.title.value}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ScheduleControl
            campaignId={campaignId}
            beatId={beat.id}
            schedule={beat.schedule}
            days={scheduleDays}
            clockStarted={clockStarted}
          />
          <DeleteBeatButton
            campaignId={campaignId}
            beatId={beat.id}
            onDeleted={() => router.replace(campaignNotesPath(campaignShortId))}
          />
        </div>
      </div>

      <DocumentEditor
        documentId={beat.id}
        title={{
          ...fields.title,
          setValue: (next) => {
            fields.title.setValue(next)
            mirrorName(beat.id, next.trim() === "" ? UNTITLED_BEAT_LABEL : next)
          },
        }}
        subtitle={fields.tagline}
        body={fields.body}
        extensions={extensions}
        messages={{
          titlePlaceholder: "Untitled beat",
          subtitleAriaLabel: "Beat tagline",
          subtitlePlaceholder: "A one-line tagline — what this scene is about",
          bodyAriaLabel: "Beat body",
          bodyPlaceholder:
            "The scene. Type @ or [[ to link an NPC, Article, or character.",
        }}
      />
    </div>
  )
}

function DeleteBeatButton({
  campaignId,
  beatId,
  onDeleted,
}: {
  campaignId: string
  beatId: string
  onDeleted: () => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete beat"
        className="text-muted-foreground"
        onClick={() => setConfirmOpen(true)}
      >
        <TrashIcon />
      </Button>
      {confirmOpen ? (
        <DeleteBeatConfirm
          campaignId={campaignId}
          beatId={beatId}
          onOpenChange={setConfirmOpen}
          onDeleted={onDeleted}
        />
      ) : null}
    </>
  )
}
