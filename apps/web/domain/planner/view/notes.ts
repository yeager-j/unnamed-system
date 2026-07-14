/**
 * Session Notes item shaping (UNN-576; folded onto the shared folder tree in
 * UNN-617): beats become leaves of the `kind = 'session'` forest that
 * `view/folder-tree.ts` assembles — the same builder the Articles and NPCs
 * rails feed. A beat's **schedule** (a slot, floating, or neither) is one
 * stored fact; its glyph and tooltip are derived here, never stored.
 */

import type { FolderTreeItem } from "./folder-tree"

/** A beat's schedule-state icon key: calendar / gold clock / none (handoff). */
export type ScheduleIconKey = "scheduled" | "floating" | "none"

/** The tree's slice of a beat row (the query's `NotesTreeBeat` shape). */
export interface BeatTreeInput {
  id: string
  folderId: string | null
  title: string
  floating: boolean
  scheduledSlot: { id: string; day: number; label: string } | null
}

export const UNTITLED_BEAT_LABEL = "Untitled beat"

/** Shapes beats into the D11 tree's item leaves (`buildFolderForest` input). */
export function buildBeatTreeItems(
  beats: readonly BeatTreeInput[]
): FolderTreeItem[] {
  return beats.map((beat) => {
    const isUntitled = beat.title.trim() === ""
    return {
      id: beat.id,
      folderId: beat.folderId,
      name: isUntitled ? UNTITLED_BEAT_LABEL : beat.title,
      iconKey: "beat",
      isUntitled,
      schedule: scheduleOf(beat),
    }
  })
}

function scheduleOf(beat: BeatTreeInput): {
  icon: ScheduleIconKey
  label: string | null
} {
  if (beat.scheduledSlot !== null) {
    return {
      icon: "scheduled",
      label: `Day ${beat.scheduledSlot.day} · ${beat.scheduledSlot.label}`,
    }
  }
  if (beat.floating)
    return { icon: "floating", label: "Floating · run anytime" }
  return { icon: "none", label: null }
}
