import { MaskHappyIcon } from "@phosphor-icons/react/dist/ssr"
import type { Metadata } from "next"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

export const metadata: Metadata = { title: "NPCs — Showtime!" }

/**
 * The NPCs index (UNN-579): the empty state inside the rail's inset — the
 * tree in the layout is the surface; picking an entry routes to its page.
 */
export default function NpcsPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MaskHappyIcon />
          </EmptyMedia>
          <EmptyTitle>NPCs</EmptyTitle>
          <EmptyDescription>
            The people of the world. Pick an NPC on the left, or quick-mint a
            name now and deepen them later.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
