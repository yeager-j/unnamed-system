import type { DungeonState } from "@workspace/game-v2/spatial"

import type { DungeonRow } from "@/lib/db/schema/dungeon"

export type DungeonSiteUrgency = "session" | "eventually"

/** Public site metadata rendered by prep and active force-place controls. */
export interface DungeonSiteTemplate {
  templateKey: string
  name: string
  appearByDefault: boolean
  defaultMinDepth: number
  defaultUrgency: DungeonSiteUrgency
  unique: boolean
  authoredZoneId?: string
}

/** The declaration fields safe to expose to DM browser surfaces. */
export interface PublicSiteDeclaration {
  id: string
  templateKey: string
  minDepth: number
  resolvedZoneId?: string
}

/**
 * The browser's dungeon state. The draw seed, cursors, hidden index,
 * qualifying progress, K, sequences, and mint inverses stay server-only.
 */
export interface DungeonClientState extends Pick<
  DungeonState,
  "turnCounter" | "actedCharacterIds" | "reminderSettings"
> {
  generation: {
    declarations: PublicSiteDeclaration[]
    mintedUniqueKeys: string[]
  }
}

/** The serializable dungeon row fields used by client console components. */
export interface DungeonClientView {
  id: string
  shortId: string
  name: string
  status: DungeonRow["status"]
  regionId: string | null
  state: DungeonClientState
}

/** Projects persisted dungeon state onto the browser-safe contract. */
export function projectDungeonClientState(
  state: DungeonState
): DungeonClientState {
  return {
    turnCounter: state.turnCounter,
    actedCharacterIds: state.actedCharacterIds,
    reminderSettings: state.reminderSettings,
    generation: {
      declarations: state.generation.declarations.map((declaration) => ({
        id: declaration.id,
        templateKey: declaration.templateKey,
        minDepth: declaration.minDepth,
        ...(declaration.resolvedZoneId === undefined
          ? {}
          : { resolvedZoneId: declaration.resolvedZoneId }),
      })),
      mintedUniqueKeys: state.generation.mintedUniqueKeys,
    },
  }
}

/** Projects a database row without forwarding dates or private state. */
export function projectDungeonClientView(
  dungeon: DungeonRow
): DungeonClientView {
  return {
    id: dungeon.id,
    shortId: dungeon.shortId,
    name: dungeon.name,
    status: dungeon.status,
    regionId: dungeon.regionId,
    state: projectDungeonClientState(dungeon.state),
  }
}
