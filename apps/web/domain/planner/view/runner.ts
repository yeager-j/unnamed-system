import { slotKind, type SlotKind, type SlotOccupancy } from "../slot-kind"

/**
 * Day Runner shaping (UNN-576, handoff Screen 1): the slot pills' kind-aware
 * meta lines and the per-slot body facts the runner forks on — a read-only
 * story-beat card, or the downtime workspace's recorded entries. Pure; the
 * page resolves participants and the roster glance separately and the
 * components render what's here.
 */

/** The runner's slice of a scheduled beat (phase 3: read-only card facts). */
export interface RunnerBeatView {
  id: string
  /** Display title — "Untitled beat" fallback applied here. */
  title: string
  tagline: string
  resolved: boolean
}

export interface RunnerSlotView {
  id: string
  ordinal: number
  label: string
  kind: SlotKind
  /** The pill's meta line: "Story · ⟨title⟩" or "Downtime · n / m recorded". */
  meta: string
  /** The pill's done tick: story ⇔ beat resolved; downtime ⇔ full roster recorded. */
  done: boolean
  /** The scheduled beat, when `kind` is story. */
  beat: RunnerBeatView | null
}

export function buildRunnerSlotViews(input: {
  slots: readonly { id: string; ordinal: number; label: string }[]
  beatsBySlot: ReadonlyMap<
    string,
    { id: string; title: string; tagline: string; resolvedAt: Date | null }
  >
  rosterSize: number
  /** Distinct characters with a recorded entry, per slot id. */
  recordedBySlot: ReadonlyMap<string, number>
}): RunnerSlotView[] {
  const occupancy: SlotOccupancy = {
    storyBeatSlotIds: new Set(input.beatsBySlot.keys()),
  }
  return input.slots.map((slot) => {
    const kind = slotKind(slot.id, occupancy)
    if (kind === "story") {
      const beat = input.beatsBySlot.get(slot.id)!
      const title = beat.title.trim() === "" ? "Untitled beat" : beat.title
      return {
        id: slot.id,
        ordinal: slot.ordinal,
        label: slot.label,
        kind,
        meta: `Story · ${title}`,
        done: beat.resolvedAt !== null,
        beat: {
          id: beat.id,
          title,
          tagline: beat.tagline,
          resolved: beat.resolvedAt !== null,
        },
      }
    }
    const recorded = Math.min(
      input.recordedBySlot.get(slot.id) ?? 0,
      input.rosterSize
    )
    return {
      id: slot.id,
      ordinal: slot.ordinal,
      label: slot.label,
      kind,
      meta:
        input.rosterSize === 0
          ? "Downtime"
          : `Downtime · ${recorded} / ${input.rosterSize} recorded`,
      done: input.rosterSize > 0 && recorded >= input.rosterSize,
      beat: null,
    }
  })
}
