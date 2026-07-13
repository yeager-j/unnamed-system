import { ScrollIcon } from "@phosphor-icons/react/dist/ssr"
import type { Metadata } from "next"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

export const metadata: Metadata = { title: "Articles — Showtime!" }

/**
 * The Articles index (UNN-579): the empty state inside the rail's inset —
 * the tree in the layout is the surface; picking an entry routes to its
 * page.
 */
export default function ArticlesPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ScrollIcon />
          </EmptyMedia>
          <EmptyTitle>Articles</EmptyTitle>
          <EmptyDescription>
            The world web — places, factions, threats, lore. Pick an article on
            the left or mint one.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
