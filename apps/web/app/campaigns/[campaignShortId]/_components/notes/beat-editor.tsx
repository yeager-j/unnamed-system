"use client"

import { TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useMemo, useRef, useState, useTransition } from "react"
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
import { Button } from "@workspace/ui/components/button"

import { DocumentEditor } from "@/components/editor/document-editor"
import { ParticipantChip } from "@/components/editor/participant-chip"
import { useBeatAutoSave } from "@/domain/planner/use-beat-autosave"
import type { LinkerOption } from "@/domain/planner/view/linker"
import type { SchedulePickerDayView } from "@/domain/planner/view/schedule-picker"
import { deleteBeatAction } from "@/lib/actions/campaign-notes/beat"

import {
  createChipSuggestionExtensions,
  type ChipSuggestionHandle,
} from "./chip-suggestion"
import { ChipSuggestionPopover } from "./chip-suggestion-popover"
import { ScheduleControl, type ScheduleState } from "./schedule-control"

const DELETE_ERROR_COPY: Record<string, string> = {
  "scheduled-to-past":
    "This beat ran on a past day — history keeps its structure. Unscheduling or deleting it isn't allowed.",
  "beat-not-found": "This beat is gone — refresh the page.",
}

/** The editor's slice of a loaded beat (serialized server → client). */
export interface BeatEditorBeat {
  id: string
  title: string
  tagline: string
  body: string
  sessionName: string | null
  schedule: ScheduleState
}

/**
 * The beat editor (handoff Screen 3): breadcrumb, display-font title,
 * tagline, the schedule control, and the chip-capable markdown body. All
 * three text fields autosave through {@link useBeatAutoSave} (~800 ms, flush
 * on blur, one queue per beat — no revalidation, D10); the body's `@`/`[[`
 * triggers summon the chip suggestion popover (D7).
 */
export function BeatEditor({
  campaignId,
  beat,
  linkerOptions,
  scheduleDays,
  clockStarted,
  onTitleChange,
  onDeleted,
}: {
  campaignId: string
  beat: BeatEditorBeat
  linkerOptions: LinkerOption[]
  scheduleDays: SchedulePickerDayView[]
  clockStarted: boolean
  /** Mirrors title keystrokes up so the tree row updates without a revalidate. */
  onTitleChange: (beatId: string, title: string) => void
  onDeleted: () => void
}) {
  const fields = useBeatAutoSave({
    campaignId,
    beatId: beat.id,
    serverTitle: beat.title,
    serverTagline: beat.tagline,
    serverBody: beat.body,
  })

  // The editor instance is long-lived: extensions are created once, and the
  // suggestion plugins read the current options/popover through these refs.
  const optionsRef = useRef<readonly LinkerOption[]>(linkerOptions)
  optionsRef.current = linkerOptions
  const suggestionHandle = useRef<ChipSuggestionHandle | null>(null)
  const extensions = useMemo(
    () => [
      ParticipantChip,
      ...createChipSuggestionExtensions({
        options: optionsRef,
        handle: suggestionHandle,
      }),
    ],
    []
  )

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="min-w-0 truncate">
          {beat.sessionName ?? "Unfiled"}
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
            onDeleted={onDeleted}
          />
        </div>
      </div>

      <DocumentEditor
        documentId={beat.id}
        title={{
          ...fields.title,
          setValue: (next) => {
            fields.title.setValue(next)
            onTitleChange(beat.id, next)
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

      <ChipSuggestionPopover
        campaignId={campaignId}
        handle={suggestionHandle}
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
  const [, startTransition] = useTransition()

  const remove = () =>
    startTransition(async () => {
      const result = await deleteBeatAction({ campaignId, beatId })
      if (!result.ok) {
        toast.error(DELETE_ERROR_COPY[result.error] ?? "Couldn't delete.")
        return
      }
      onDeleted()
    })

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
        <AlertDialog open onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this beat?</AlertDialogTitle>
              <AlertDialogDescription>
                The note and its prose are gone for good. Beats that already ran
                on a past day can&apos;t be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmOpen(false)
                  remove()
                }}
              >
                Delete beat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}
