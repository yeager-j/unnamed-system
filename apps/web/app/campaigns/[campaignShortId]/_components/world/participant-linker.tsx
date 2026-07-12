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
          const ref = await mintParticipantRef(kind, campaignId, name)
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
                    <LinkerRowContent option={option} />
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
                  <MintRowContent kind="npc" query={query.trim()} />
                </CommandItem>
                <CommandItem
                  forceMount
                  value="__create-article"
                  disabled={isPending}
                  onSelect={() => mint("article")}
                >
                  <MintRowContent kind="article" query={query.trim()} />
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/**
 * A linker result row's content — icon, label, sublabel — shared by the
 * anchored popover's `CommandItem`s and the editor suggestion popover's
 * listbox rows (UNN-576): one row visual, two keyboard chromes.
 */
export function LinkerRowContent({ option }: { option: LinkerOption }) {
  return (
    <>
      <KindIcon iconKey={option.iconKey} />
      <span className="min-w-0 flex-1 truncate font-medium">
        {option.label}
      </span>
      {option.sublabel === null ? null : (
        <span className="shrink-0 text-xs text-muted-foreground">
          {option.sublabel}
        </span>
      )}
    </>
  )
}

/** A quick-mint row's content ("Create '⟨query⟩' as NPC" / "…as Article"), shared like {@link LinkerRowContent}. */
export function MintRowContent({
  kind,
  query,
}: {
  kind: "npc" | "article"
  query: string
}) {
  return (
    <>
      <PlusIcon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">
        {kind === "npc" ? (
          <>Create &ldquo;{query}&rdquo; as NPC</>
        ) : (
          "…as Article"
        )}
      </span>
    </>
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

/**
 * Runs a quick-mint and shapes the result into a {@link ParticipantRef} —
 * shared by this popover's mint rows and the editor suggestion popover's
 * (UNN-576). Returns null on failure so callers own their error copy.
 */
export async function mintParticipantRef(
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
