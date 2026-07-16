"use client"

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react"

/**
 * The **pairing-glow channel** for rim thresholds (UNN-633, §D4). A connection's two
 * notches and its two partner cards live in different DOM branches (the notches paint
 * in the edge-label layer; the cards are React Flow nodes), so lighting all four
 * together on hover/focus/selection needs a tiny shared channel rather than a tether.
 *
 * The custom edge writes the lit connection here; each notch reads whether *its*
 * connection is lit, and each zone card reads whether a threshold *touching it* is lit.
 * No tether ever renders — orientation + this co-glow carry the pairing. The default
 * value is an inert no-op so a canvas that never mounts the provider simply never
 * glows (nothing throws).
 */
export type HoveredConnection = {
  connectionId: string
  zoneIds: readonly [string, string]
} | null

interface HoveredConnectionContextValue {
  hovered: HoveredConnection
  setHovered: (next: HoveredConnection) => void
}

const INERT: HoveredConnectionContextValue = {
  hovered: null,
  setHovered: () => {},
}

const HoveredConnectionContext =
  createContext<HoveredConnectionContextValue>(INERT)

export function HoveredConnectionProvider({
  children,
}: {
  children: ReactNode
}) {
  const [hovered, setHovered] = useState<HoveredConnection>(null)
  const value = useMemo(() => ({ hovered, setHovered }), [hovered])
  return (
    <HoveredConnectionContext.Provider value={value}>
      {children}
    </HoveredConnectionContext.Provider>
  )
}

/** For the custom edge: read + set the currently-lit connection. */
export function useHoveredConnection(): HoveredConnectionContextValue {
  return useContext(HoveredConnectionContext)
}

/** For a zone card: true when a threshold touching this zone is currently lit. */
export function useConnectionHighlight(zoneId: string): boolean {
  const { hovered } = useContext(HoveredConnectionContext)
  return (
    hovered !== null &&
    (hovered.zoneIds[0] === zoneId || hovered.zoneIds[1] === zoneId)
  )
}

/** For a notch: true when its own connection is currently lit. */
export function useNotchHighlight(connectionId: string): boolean {
  const { hovered } = useContext(HoveredConnectionContext)
  return hovered?.connectionId === connectionId
}

/**
 * Focus/blur handlers for the canvas wrapper that light the pairing glow when a
 * **keyboard** user tabs onto a threshold edge. React Flow exposes edge *mouse*
 * events but no edge focus event, and the read-only console/watch edges are
 * `selectable: false` so Enter can't select as a fallback — without this a
 * keyboard user hears the edge announced but sees no pairing cue. React focus
 * events bubble, so catching them on the wrapper covers every surface uniformly:
 * focusing an edge lights its notches + partner cards, blurring clears.
 */
export function useEdgeFocusPairing(
  edges: readonly { id: string; source: string; target: string }[]
): {
  onFocus: (event: FocusEvent) => void
  onBlur: (event: FocusEvent) => void
} {
  const { setHovered } = useHoveredConnection()
  return {
    onFocus: (event) => {
      const id = (event.target as HTMLElement)
        .closest?.(".react-flow__edge")
        ?.getAttribute("data-id")
      if (!id) return
      const edge = edges.find((e) => e.id === id)
      if (edge) {
        setHovered({ connectionId: id, zoneIds: [edge.source, edge.target] })
      }
    },
    onBlur: (event) => {
      if ((event.target as HTMLElement).closest?.(".react-flow__edge")) {
        setHovered(null)
      }
    },
  }
}
