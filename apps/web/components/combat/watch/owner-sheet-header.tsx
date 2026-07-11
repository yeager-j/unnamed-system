"use client"

import { useState } from "react"

import { AdjustPoolControl } from "@/components/shared/adjust-pool-control"
import { VitalsBlock } from "@/components/shared/vitals-block"
import { buildRailView } from "@/domain/character/view/rail-view"
import { useLoadedCharacter } from "@/hooks/use-entity-write"

/**
 * The own-sheet column's masthead, shared by both watches (UNN-566): identity,
 * the HP/SP bars, and the two pool-adjust popovers — the vitals loop a player
 * needs while the DM runs the table.
 *
 * Deliberately **not** the sheet's `SheetRail`: Rest, Level Up, and the
 * Archetype switcher are out-of-combat, out-of-delve actions and stay on
 * `/characters/{shortId}`. The Archetype reads as a static pill here for the same
 * reason.
 */
export function OwnerSheetHeader() {
  const { profile, entity, resolved } = useLoadedCharacter()
  const [open, setOpen] = useState<"hp" | "sp" | null>(null)

  const view = buildRailView(profile, entity, resolved)
  const toggle = (key: "hp" | "sp") => (next: boolean) =>
    setOpen(next ? key : null)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <h2 className="font-display text-lg leading-tight">{view.name}</h2>
        {view.pronouns ? (
          <p className="text-xs text-muted-foreground">{view.pronouns}</p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {view.level !== null ? <Pill>Lv {view.level}</Pill> : null}
          {view.archetype?.activeName ? (
            <Pill>
              {view.archetype.activeName} · Rk {view.archetype.activeRank}
            </Pill>
          ) : null}
        </div>
      </header>

      <VitalsBlock hp={view.hp} sp={view.sp} />

      {view.hp || view.sp ? (
        <div className="grid grid-cols-2 gap-1.5">
          {view.hp ? (
            <AdjustPoolControl
              label="Adjust HP"
              component="vitals"
              positiveLabel="Heal"
              negativeLabel="Damage"
              open={open === "hp"}
              onOpenChange={toggle("hp")}
            />
          ) : null}
          {view.sp ? (
            <AdjustPoolControl
              label="Adjust SP"
              component="skillPool"
              positiveLabel="Restore"
              negativeLabel="Spend"
              open={open === "sp"}
              onOpenChange={toggle("sp")}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground">
      {children}
    </span>
  )
}
