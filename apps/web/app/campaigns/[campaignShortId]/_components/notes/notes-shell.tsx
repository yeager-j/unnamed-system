"use client"

import { NotebookIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@workspace/ui/components/sidebar"

import type { LinkerOption } from "@/domain/planner/view/linker"
import {
  buildNotesTree,
  type NotesTreeBeatInput,
  type NotesTreeSessionInput,
} from "@/domain/planner/view/notes-tree"
import type { SchedulePickerDayView } from "@/domain/planner/view/schedule-picker"
import { createBeatAction } from "@/lib/actions/campaign-notes/beat"
import {
  createSessionAction,
  deleteSessionAction,
  renameSessionAction,
} from "@/lib/actions/campaign-notes/session"
import { campaignNotesPath } from "@/lib/paths"

import { BeatEditor, type BeatEditorBeat } from "./beat-editor"
import { NotesTree } from "./notes-tree"

/**
 * The Session Notes surface's client shell (handoff Screen 3): the tree
 * sidebar + the beat editor, the same page-owned inset-sidebar pattern as
 * the Day Runner. Selection is the `?beat=` search param (server reloads the
 * beat); the shell holds a client-side **title mirror** so a title autosave
 * — which never revalidates (D10) — still updates the tree row instantly.
 */
export function NotesShell({
  campaignId,
  campaignShortId,
  campaignName,
  dayLine,
  sessions,
  beats,
  selectedBeat,
  linkerOptions,
  scheduleDays,
  clockStarted,
}: {
  campaignId: string
  campaignShortId: string
  campaignName: string
  dayLine: string | null
  sessions: NotesTreeSessionInput[]
  beats: NotesTreeBeatInput[]
  selectedBeat: BeatEditorBeat | null
  linkerOptions: LinkerOption[]
  scheduleDays: SchedulePickerDayView[]
  clockStarted: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [titleMirror, setTitleMirror] = useState<Record<string, string>>({})

  const folders = buildNotesTree(
    sessions,
    beats.map((beat) => ({
      ...beat,
      title: titleMirror[beat.id] ?? beat.title,
    }))
  )

  const select = (beatId: string) =>
    router.replace(`${campaignNotesPath(campaignShortId)}?beat=${beatId}`)

  const run = (
    write: () => Promise<{ ok: true } | { ok: false; error: string }>,
    after?: () => void
  ) =>
    startTransition(async () => {
      const result = await write()
      if (!result.ok) {
        toast.error("Couldn't save. Try again.")
        return
      }
      after?.()
    })

  return (
    <SidebarProvider className="min-h-0 flex-1 bg-sidebar">
      <Sidebar
        collapsible="none"
        className="sticky top-14 h-[calc(100svh-3.5rem)] shrink-0"
      >
        <NotesTree
          dayLine={dayLine}
          campaignName={campaignName}
          folders={folders}
          selectedBeatId={selectedBeat?.id ?? null}
          onSelectBeat={select}
          onCreateSession={(name) =>
            run(() => createSessionAction({ campaignId, name }))
          }
          onRenameSession={(sessionId, name) =>
            run(() => renameSessionAction({ campaignId, sessionId, name }))
          }
          onDeleteSession={(sessionId) =>
            run(() => deleteSessionAction({ campaignId, sessionId }))
          }
          onCreateBeat={(sessionId) =>
            startTransition(async () => {
              const result = await createBeatAction({ campaignId, sessionId })
              if (!result.ok) {
                toast.error("Couldn't create the beat. Try again.")
                return
              }
              select(result.value.id)
            })
          }
        />
      </Sidebar>
      <SidebarInset className="m-2 ml-0 min-w-0 rounded-xl shadow-sm">
        {selectedBeat ? (
          <BeatEditor
            key={selectedBeat.id}
            campaignId={campaignId}
            campaignShortId={campaignShortId}
            beat={selectedBeat}
            linkerOptions={linkerOptions}
            scheduleDays={scheduleDays}
            clockStarted={clockStarted}
            onTitleChange={(beatId, title) =>
              setTitleMirror((mirror) => ({ ...mirror, [beatId]: title }))
            }
            onDeleted={() => router.replace(campaignNotesPath(campaignShortId))}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <NotebookIcon />
                </EmptyMedia>
                <EmptyTitle>Session Notes</EmptyTitle>
                <EmptyDescription>
                  Folders are sessions, notes are beats — one scene per note.
                  Pick a note on the left or create one.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
