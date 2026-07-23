"use client"

import { CaretDownIcon } from "@phosphor-icons/react"
import { useState } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

import { useViewerRole } from "@/components/shell/viewer-role"
import { characterEntityWrite, CharacterRoot } from "@/domain/character/client"
import type { RailArchetype, RailView } from "@/domain/character/view/rail-view"
import { LINEAGE_LABELS } from "@/domain/labels"

/**
 * The rail's identity block: display-serif name, muted pronouns, the level
 * pill, and the **archetype pill** — which doubles as the Switch Archetype
 * control (design handoff: "it lives in the rail so it's reachable from any
 * tab"). Switching dispatches `archetypes.setActive`; the optimistic re-fold
 * swaps attributes/affinities/skills/mechanic in the same frame.
 */
export function IdentityBlock({ view }: { view: RailView }) {
  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="font-display text-xl leading-tight">{view.name}</h1>
      {view.pronouns ? (
        <p className="text-xs text-muted-foreground">{view.pronouns}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {view.level !== null ? <Pill>Lv {view.level}</Pill> : null}
        {view.archetype ? <ArchetypePill archetype={view.archetype} /> : null}
      </div>
    </header>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground">
      {children}
    </span>
  )
}

function ArchetypePill({ archetype }: { archetype: RailArchetype }) {
  const role = useViewerRole()
  const root = CharacterRoot.useRoot()
  const [open, setOpen] = useState(false)

  const label =
    archetype.activeName === null
      ? "No Archetype"
      : `${archetype.activeName} · Rk ${archetype.activeRank}`

  if (role !== "owner") {
    return <Pill>{label}</Pill>
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2.5 py-0.5 text-xs font-medium hover:bg-primary/20"
        aria-label="Switch Archetype"
      >
        {label}
        <CaretDownIcon className="size-3" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <p className="px-2 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Switch Archetype
        </p>
        <div className="flex flex-col gap-1.5">
          {archetype.groups.map((group) => (
            <div key={group.lineage}>
              <p className="px-2 py-1 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
                {LINEAGE_LABELS[group.lineage]}
              </p>
              <ul className="flex flex-col">
                {group.options.map((option) => {
                  const isActive = option.key === archetype.activeKey
                  return (
                    <li key={option.key}>
                      <button
                        type="button"
                        disabled={isActive}
                        onClick={() => {
                          root.mutate(
                            characterEntityWrite({
                              entityId: root.value.profile.id,
                              write: {
                                component: "archetypes",
                                op: "setActive",
                                archetypeKey: option.key,
                              },
                            })
                          )
                          setOpen(false)
                        }}
                        className={cn(
                          "flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                          isActive
                            ? "bg-primary/10 font-medium"
                            : "hover:bg-muted"
                        )}
                      >
                        <span>
                          {option.name} · Rank {option.rank}
                        </span>
                        {option.mechanicName ? (
                          <span className="text-xs text-muted-foreground">
                            {option.mechanicName}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
