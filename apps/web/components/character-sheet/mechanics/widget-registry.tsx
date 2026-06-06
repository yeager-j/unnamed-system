import { type ReactNode } from "react"

import {
  rankLabel,
  VALOR_MAX,
  type MechanicKind,
  type MechanicState,
} from "@workspace/game/mechanics"

import { STAIN_ELEMENT_LABELS } from "@/lib/ui/labels"

import { PathOfDawnWidget } from "./path-of-dawn-widget"
import { PathOfDuskWidget } from "./path-of-dusk-widget"
import { PerfectionWidget } from "./perfection-widget"
import { StainsWidget } from "./stains-widget"
import { ValorWidget } from "./valor-widget"

/**
 * Per-kind dispatch table for mechanic UI. Centralizes the two surfaces every
 * mechanic owns — the interactive Combat-tab widget and the compact
 * Archetypes-tab summary line — so adding a new mechanic is one entry here
 * plus the per-mechanic module under [lib/game/mechanics/](../../../lib/game/mechanics/),
 * with no call site needing to change.
 *
 * Lives in the UI layer (not on `MechanicDefinition`) because the per-mechanic
 * modules in `lib/game/` deliberately stay React-free; widgets and their
 * dispatch register here, where importing components is natural.
 *
 * Widgets receive only `state`. If a widget needs more (e.g. the Lumina cap
 * derived from Luck), it pulls the hydrated character from `useCharacter()`
 * itself — the registry stays uniform and uninvolved.
 */
interface MechanicWidgetEntry<K extends MechanicKind> {
  /** Renders the Combat-tab widget. */
  render(state: Extract<MechanicState, { kind: K }>): ReactNode
  /** One-line snapshot shown on the Archetypes-tab info card. */
  summary(state: Extract<MechanicState, { kind: K }>): string
}

type MechanicWidgetRegistry = {
  [K in MechanicKind]: MechanicWidgetEntry<K>
}

const REGISTRY: MechanicWidgetRegistry = {
  perfection: {
    render: (state) => <PerfectionWidget state={state} />,
    summary: (state) => `Rank ${rankLabel(state.rank)}`,
  },
  valor: {
    render: (state) => <ValorWidget state={state} />,
    summary: (state) => `${state.value} / ${VALOR_MAX}`,
  },
  "path-of-dawn": {
    render: (state) => <PathOfDawnWidget state={state} />,
    summary: (state) => (state.dawnMode ? "Dawn Mode" : "Inactive"),
  },
  "path-of-dusk": {
    render: (state) => <PathOfDuskWidget state={state} />,
    summary: (state) => (state.duskMode ? "Dusk Mode" : "Inactive"),
  },
  stains: {
    render: (state) => <StainsWidget state={state} />,
    summary: (state) => {
      const filled = state.tokens.filter(
        (token): token is NonNullable<typeof token> => token !== null
      )
      if (filled.length === 0) return "No Stains"
      return filled.map((token) => STAIN_ELEMENT_LABELS[token]).join(", ")
    },
  },
}

/**
 * Renders the Combat-tab widget for the given mechanic state. The local cast
 * is the one place TS can't statically correlate the indexed kind with the
 * matching state shape — every other call site stays type-safe.
 */
export function renderMechanicWidget(state: MechanicState): ReactNode {
  const entry = REGISTRY[state.kind] as MechanicWidgetEntry<MechanicKind>
  return entry.render(state)
}

/** Compact summary line for the Archetypes-tab info card. */
export function summarizeMechanicState(state: MechanicState): string {
  const entry = REGISTRY[state.kind] as MechanicWidgetEntry<MechanicKind>
  return entry.summary(state)
}
