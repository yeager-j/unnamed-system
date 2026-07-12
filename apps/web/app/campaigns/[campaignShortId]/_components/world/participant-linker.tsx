"use client"

import { PlusIcon } from "@phosphor-icons/react/dist/ssr"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

import { PARTICIPANT_KIND_ICONS } from "@/components/shared/participant-kind-icons"
import type { ParticipantRef } from "@/domain/planner/participant"
import type { LinkerIconKey, LinkerOption } from "@/domain/planner/view/linker"
import { mintArticleAction } from "@/lib/actions/campaign-world/mint-article"
import { mintNpcAction } from "@/lib/actions/campaign-world/mint-npc"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

/**
 * The **participant linker** (UNN-575, handoff "entity linker"): an anchored
 * popover with a search combobox over the campaign's world web — NPCs,
 * Articles, placed characters — plus the two **quick-mint rows** ("Create
 * '⟨query⟩' as NPC" / "…as Article", D7: no kind-picker sub-step). Picking or
 * minting hands a {@link ParticipantRef} to the mounting surface and closes.
 *
 * One component, several mounts: the world list pages' "New…" buttons today;
 * phase 3 mounts it as the composer's "+" and reuses its rows for the editor
 * suggestion popover. Options are preloaded by the mounting surface (cmdk
 * filters in-memory); the mint actions revalidate the campaign subtree.
 */
export function ParticipantLinker({
  campaignId,
  options,
  trigger,
  onPick,
}: {
  campaignId: string
  options: LinkerOption[]
  /** The anchor control, e.g. a "New NPC" button or the composer's ghost "+". */
  trigger: React.ReactElement
  onPick?: (ref: ParticipantRef) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [isPending, startTransition] = useTransition()

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setQuery("")
  }

  function pick(ref: ParticipantRef) {
    onOpenChange(false)
    onPick?.(ref)
  }

  function mint(kind: "npc" | "article") {
    const name = query.trim()
    if (name === "" || isPending) return
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const ref = await mintRef(kind, campaignId, name)
          if (ref === null) {
            toast.error(`Couldn't create ${name}. Try again.`)
            return
          }
          toast.success(`${name} created.`)
          pick(ref)
        },
        () => toast.error(`Couldn't create ${name}. Try again.`)
      )
    )
  }

  const canMint = query.trim() !== ""

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput
            placeholder="Link an NPC, Article, or place…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {canMint ? null : (
              <CommandEmpty>Nothing in the world web yet.</CommandEmpty>
            )}
            {options.length > 0 ? (
              <CommandGroup heading="From the world web">
                {options.map((option) => (
                  <CommandItem
                    key={`${option.ref.kind}:${option.ref.id}`}
                    value={`${option.label} ${option.sublabel ?? ""}`}
                    onSelect={() => pick(option.ref)}
                  >
                    <KindIcon iconKey={option.iconKey} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {option.label}
                    </span>
                    {option.sublabel === null ? null : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {option.sublabel}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {canMint ? (
              <CommandGroup forceMount>
                <CommandItem
                  forceMount
                  value="__create-npc"
                  disabled={isPending}
                  onSelect={() => mint("npc")}
                >
                  <PlusIcon className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">
                    Create &ldquo;{query.trim()}&rdquo; as NPC
                  </span>
                </CommandItem>
                <CommandItem
                  forceMount
                  value="__create-article"
                  disabled={isPending}
                  onSelect={() => mint("article")}
                >
                  <PlusIcon className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">…as Article</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Renders a linker row's leading kind glyph — NPCs in the primary indigo, the rest muted. */
export function KindIcon({ iconKey }: { iconKey: LinkerIconKey }) {
  const Icon = PARTICIPANT_KIND_ICONS[iconKey]
  return (
    <Icon
      aria-hidden
      className={cn(
        "size-4 shrink-0",
        iconKey === "npc" ? "text-primary-text" : "text-muted-foreground"
      )}
    />
  )
}

async function mintRef(
  kind: "npc" | "article",
  campaignId: string,
  name: string
): Promise<ParticipantRef | null> {
  if (kind === "npc") {
    const result = await mintNpcAction({ campaignId, name })
    if (!result.ok) return null
    return { kind: "npc", id: result.value.entityId, label: name }
  }
  const result = await mintArticleAction({ campaignId, name })
  if (!result.ok) return null
  return { kind: "article", id: result.value.id, label: name }
}
