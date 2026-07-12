import { slotKind, type SlotKind, type SlotOccupancy } from "../slot-kind"

/**
 * Day Runner shaping (UNN-576/577, handoff Screen 1): the slot pills'
 * kind-aware meta lines and the per-slot body facts the runner forks on — a
 * story-beat card, a dungeon claim card, or the downtime workspace's
 * recorded entries. Pure; the page resolves participants and the roster
 * glance separately and the components render what's here.
 */

/** The runner's slice of a scheduled beat (card facts + write tokens). */
export interface RunnerBeatView {
  id: string
  /** Display title — "Untitled beat" fallback applied here. */
  title: string
  tagline: string
  /** Raw markdown body (chip tokens included) for the inline read-only render. */
  body: string
  resolved: boolean
}

/** The runner's slice of a dungeon slot claim (D9's runner card). */
export interface RunnerDungeonView {
  dungeonId: string
  shortId: string
  name: string
  resolved: boolean
}

export interface RunnerSlotView {
  id: string
  ordinal: number
  label: string
  kind: SlotKind
  /** The pill's meta line: "Story · ⟨title⟩", "Dungeon · ⟨name⟩", or "Downtime · n / m recorded". */
  meta: string
  /** The pill's done tick: story/dungeon ⇔ resolved; downtime ⇔ full roster recorded. */
  done: boolean
  /** The scheduled beat, when `kind` is story. */
  beat: RunnerBeatView | null
  /** The claimed dungeon, when `kind` is dungeon. */
  dungeon: RunnerDungeonView | null
}

export function buildRunnerSlotViews(input: {
  slots: readonly { id: string; ordinal: number; label: string }[]
  beatsBySlot: ReadonlyMap<
    string,
    {
      id: string
      title: string
      tagline: string
      body: string
      resolvedAt: Date | null
    }
  >
  claimsBySlot: ReadonlyMap<
    string,
    {
      dungeonId: string
      shortId: string
      name: string
      resolvedAt: Date | null
    }
  >
  rosterSize: number
  /** Distinct characters with a recorded entry, per slot id. */
  recordedBySlot: ReadonlyMap<string, number>
}): RunnerSlotView[] {
  const occupancy: SlotOccupancy = {
    storyBeatSlotIds: new Set(input.beatsBySlot.keys()),
    dungeonClaimSlotIds: new Set(input.claimsBySlot.keys()),
  }
  return input.slots.map((slot) => {
    const kind = slotKind(slot.id, occupancy)
    const base = {
      id: slot.id,
      ordinal: slot.ordinal,
      label: slot.label,
      kind,
      beat: null,
      dungeon: null,
    }
    if (kind === "story") {
      const beat = input.beatsBySlot.get(slot.id)!
      const title = beat.title.trim() === "" ? "Untitled beat" : beat.title
      return {
        ...base,
        meta: `Story · ${title}`,
        done: beat.resolvedAt !== null,
        beat: {
          id: beat.id,
          title,
          tagline: beat.tagline,
          body: beat.body,
          resolved: beat.resolvedAt !== null,
        },
      }
    }
    if (kind === "dungeon") {
      const claim = input.claimsBySlot.get(slot.id)!
      return {
        ...base,
        meta: `Dungeon · ${claim.name}`,
        done: claim.resolvedAt !== null,
        dungeon: {
          dungeonId: claim.dungeonId,
          shortId: claim.shortId,
          name: claim.name,
          resolved: claim.resolvedAt !== null,
        },
      }
    }
    const recorded = Math.min(
      input.recordedBySlot.get(slot.id) ?? 0,
      input.rosterSize
    )
    return {
      ...base,
      meta:
        input.rosterSize === 0
          ? "Downtime"
          : `Downtime · ${recorded} / ${input.rosterSize} recorded`,
      done: input.rosterSize > 0 && recorded >= input.rosterSize,
    }
  })
}
