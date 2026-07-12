"use client"

import { CaretDownIcon, MoonIcon } from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"

import { ACTIVITY_CATEGORY_LABELS } from "@/domain/labels"
import type { UpdateCategory } from "@/lib/db/schema/campaign-updates"

/** One suppressed entry, pre-labeled by the page (D3's "kept" reading). */
export interface SetAsideEntry {
  id: string
  characterName: string
  category: UpdateCategory | null
  body: string
}

/**
 * The **set-aside disclosure** (UNN-577, tech-design D3/D9): a story or
 * dungeon slot suppresses the downtime recorded under it — derived, nothing
 * written — and this read-only fold keeps those entries reachable ("kept" in
 * the PRD's sense). Deferring the beat or removing the claim resurfaces them
 * as live entries; if the day ends with the scene in place, this stays their
 * only window.
 */
export function SetAsideDisclosure({ entries }: { entries: SetAsideEntry[] }) {
  const [open, setOpen] = useState(false)
  if (entries.length === 0) return null

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mx-auto mt-3 w-full max-w-2xl"
    >
      <CollapsibleTrigger className="flex items-center gap-1 px-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <CaretDownIcon
          className={cn("size-3.5 transition-transform", !open && "-rotate-90")}
        />
        Set aside · {entries.length} recorded{" "}
        {entries.length === 1 ? "entry" : "entries"}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <p className="text-xs text-muted-foreground">
            Recorded before this slot was claimed. Kept, read-only — defer the
            beat or remove the delve to bring them back.
          </p>
          {entries.map((entry) => {
            const idleEmpty =
              entry.category === "idle" && entry.body.trim() === ""
            return (
              <div key={entry.id} className="rounded-md bg-muted/20 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {entry.characterName}
                  </span>
                  {entry.category ? (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      {entry.category === "idle" ? (
                        <MoonIcon className="size-3" />
                      ) : null}
                      {ACTIVITY_CATEGORY_LABELS[entry.category]}
                    </Badge>
                  ) : null}
                </div>
                <p
                  className={cn(
                    "mt-1 text-sm",
                    idleEmpty
                      ? "text-muted-foreground italic"
                      : "text-muted-foreground"
                  )}
                >
                  {idleEmpty ? "Did nothing substantial." : entry.body}
                </p>
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
