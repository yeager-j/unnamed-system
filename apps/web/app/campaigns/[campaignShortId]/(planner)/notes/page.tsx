import { NotebookIcon } from "@phosphor-icons/react/dist/ssr"
import type { Metadata } from "next"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

export const metadata: Metadata = { title: "Session Notes — Showtime!" }

/**
 * The Session Notes index (UNN-617): the empty state inside the rail's inset
 * — the tree in the layout is the surface; picking a beat routes to its page.
 */
export default function NotesPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <NotebookIcon />
          </EmptyMedia>
          <EmptyTitle>Session Notes</EmptyTitle>
          <EmptyDescription>
            Folders are sessions, notes are beats — one scene per note. Pick a
            note on the left or create one.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
