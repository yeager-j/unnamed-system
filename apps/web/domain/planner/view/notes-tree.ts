/**
 * Session Notes tree shaping (UNN-576, PRD FR-4): sessions become folders,
 * beats group under them, and beats with no session gather in the virtual
 * **Unfiled** folder — derived, never a stored row (D1's one-stored-fact
 * discipline applied to organization). Pure; the component filters and
 * renders.
 */

/** The tree's slice of a session row. */
export interface NotesTreeSessionInput {
  id: string
  name: string
}

/** The tree's slice of a beat row (the query's `NotesTreeBeat` shape). */
export interface NotesTreeBeatInput {
  id: string
  sessionId: string | null
  title: string
  floating: boolean
  scheduledSlot: { id: string; day: number; label: string } | null
}

/** A beat's schedule-state icon key: calendar / gold clock / none (handoff). */
export type ScheduleIconKey = "scheduled" | "floating" | "none"

export interface NotesTreeBeatView {
  id: string
  /** Display title — "Untitled beat" for an empty one. */
  title: string
  scheduleIcon: ScheduleIconKey
  /** The icon's tooltip: "Day 15 · Morning", "Floating · run anytime", or null. */
  scheduleLabel: string | null
}

export interface NotesTreeFolderView {
  /** The session id, or null for the virtual Unfiled folder. */
  sessionId: string | null
  name: string
  beats: NotesTreeBeatView[]
}

export const UNTITLED_BEAT_LABEL = "Untitled beat"

/**
 * Groups beats under their sessions (input order preserved — the queries
 * order by creation) and appends the virtual **Unfiled** folder when any
 * beat is sessionless. Sessions render even when empty (a fresh folder is a
 * real thing); Unfiled only exists while it has beats.
 */
export function buildNotesTree(
  sessions: readonly NotesTreeSessionInput[],
  beats: readonly NotesTreeBeatInput[]
): NotesTreeFolderView[] {
  const bySession = new Map<string | null, NotesTreeBeatView[]>()
  for (const beat of beats) {
    const views = bySession.get(beat.sessionId) ?? []
    views.push(beatView(beat))
    bySession.set(beat.sessionId, views)
  }

  const folders = sessions.map(
    (session): NotesTreeFolderView => ({
      sessionId: session.id,
      name: session.name,
      beats: bySession.get(session.id) ?? [],
    })
  )
  const unfiled = bySession.get(null)
  if (unfiled !== undefined) {
    folders.push({ sessionId: null, name: "Unfiled", beats: unfiled })
  }
  return folders
}

/**
 * Case-insensitive tree filter for the client-side search box: keeps a
 * folder when its name matches (all beats shown) or narrows it to its
 * matching beats. Empty query returns the tree untouched.
 */
export function filterNotesTree(
  folders: readonly NotesTreeFolderView[],
  query: string
): NotesTreeFolderView[] {
  const needle = query.trim().toLowerCase()
  if (needle === "") return [...folders]
  return folders.flatMap((folder) => {
    if (folder.name.toLowerCase().includes(needle)) return [folder]
    const beats = folder.beats.filter((beat) =>
      beat.title.toLowerCase().includes(needle)
    )
    return beats.length === 0 ? [] : [{ ...folder, beats }]
  })
}

function beatView(beat: NotesTreeBeatInput): NotesTreeBeatView {
  const title = beat.title.trim() === "" ? UNTITLED_BEAT_LABEL : beat.title
  if (beat.scheduledSlot !== null) {
    return {
      id: beat.id,
      title,
      scheduleIcon: "scheduled",
      scheduleLabel: `Day ${beat.scheduledSlot.day} · ${beat.scheduledSlot.label}`,
    }
  }
  if (beat.floating) {
    return {
      id: beat.id,
      title,
      scheduleIcon: "floating",
      scheduleLabel: "Floating · run anytime",
    }
  }
  return { id: beat.id, title, scheduleIcon: "none", scheduleLabel: null }
}
