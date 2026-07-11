"use client"

import type { ResolvedActiveMechanic } from "@workspace/game-v2/mechanics/resolved"

import { useLoadedCharacter } from "@/domain/entity/use-entity-write"

import { DisplayOnlyWidget } from "./display-only-widget"
import { FrenzyWidget } from "./frenzy-widget"
import { ModeToggleWidget } from "./mode-toggle-widget"
import { PerfectionWidget } from "./perfection-widget"
import { StainsWidget } from "./stains-widget"
import { ValorWidget } from "./valor-widget"

/**
 * The rail's Archetype-mechanic slot (design handoff item 7): one widget per
 * mechanic kind, keyed off the resolved `activeMechanics` read-unit — swapping
 * the active Archetype swaps the widget in the same optimistic frame. Every
 * write-capable widget dispatches `mechanics`-family descriptors through the
 * provider (widget blindness, CH20); the table-tracked mechanics (Tells,
 * Enchantment fortes) render display-only cards.
 *
 * This dispatch is a reducer-style exhaustive switch over a closed vocabulary
 * (the registry's 9 kinds), so it stays a `switch`, not a lookup registry.
 */
export function MechanicWidget() {
  const { resolved } = useLoadedCharacter()
  const active = resolved.components.activeMechanics ?? []

  if (active.length === 0) return null

  return (
    <>
      {active.map((mechanic) => (
        <section
          key={mechanic.kind}
          aria-label="Archetype Mechanic"
          className="flex flex-col gap-2 rounded-md border bg-background/60 p-2.5"
        >
          <WidgetFor mechanic={mechanic} />
        </section>
      ))}
    </>
  )
}

function WidgetFor({ mechanic }: { mechanic: ResolvedActiveMechanic }) {
  const { kind, state } = mechanic
  switch (state.kind) {
    case "valor":
      return <ValorWidget state={state} />
    case "frenzy":
      return <FrenzyWidget state={state} />
    case "perfection":
      return <PerfectionWidget state={state} />
    case "stains":
      return <StainsWidget state={state} />
    case "path-of-dawn":
      return (
        <ModeToggleWidget
          mechanic="path-of-dawn"
          modeLabel="Dawn Mode"
          on={state.dawnMode}
        />
      )
    case "path-of-dusk":
      return (
        <ModeToggleWidget
          mechanic="path-of-dusk"
          modeLabel="Dusk Mode"
          on={state.duskMode}
        />
      )
    case "thiefs-insight":
    case "elemental-larceny":
    case "enchantment":
      return <DisplayOnlyWidget kind={kind} />
  }
}
