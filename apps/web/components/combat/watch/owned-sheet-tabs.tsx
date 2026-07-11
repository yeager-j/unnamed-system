"use client"

import type { ResolveContext } from "@workspace/game-v2/resolve/resolve"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { ViewerRoleProvider } from "@/components/shell/viewer-role"
import type { LoadedCharacter } from "@/domain/character/load"
import { EntityWriteProvider } from "@/hooks/use-entity-write"

/**
 * One character the watch viewer owns, as the column mounts it: a stable tab
 * key, the loaded triple, and the context its `resolved` half was folded with.
 */
export interface OwnedSheet {
  key: string
  character: LoadedCharacter
  /** Inert outside an encounter (the delve's exploration column). */
  resolveContext?: ResolveContext
}

/**
 * The watch views' own-sheet column shell (UNN-566): each owned character is
 * mounted in **owner mode** under its own {@link EntityWriteProvider}, so the
 * sheet components the column composes write through `useEntityWrite`
 * descriptors exactly as they do on `/characters/{shortId}` — no watch-specific write
 * path exists.
 *
 * A viewer can have more than one character in an encounter or a delve, so the
 * column tabs between them; a single owned character drops the tab bar. The
 * body is the caller's (`renderSheet`), because the two watches show different
 * sheets of the same character: the encounter's combat surface, the delve's
 * Explore surface.
 */
export function OwnedSheetTabs({
  sheets,
  renderSheet,
}: {
  sheets: OwnedSheet[]
  renderSheet: (sheet: OwnedSheet) => React.ReactNode
}) {
  const first = sheets[0]
  if (first === undefined) return null

  if (sheets.length === 1) {
    return <MountedSheet sheet={first}>{renderSheet(first)}</MountedSheet>
  }

  return (
    <Tabs defaultValue={first.key} className="gap-4">
      <TabsList className="w-full">
        {sheets.map((sheet) => (
          <TabsTrigger
            key={sheet.key}
            value={sheet.key}
            className="flex-1 truncate"
          >
            {sheet.character.profile.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {sheets.map((sheet) => (
        <TabsContent key={sheet.key} value={sheet.key}>
          <MountedSheet sheet={sheet}>{renderSheet(sheet)}</MountedSheet>
        </TabsContent>
      ))}
    </Tabs>
  )
}

function MountedSheet({
  sheet,
  children,
}: {
  sheet: OwnedSheet
  children: React.ReactNode
}) {
  return (
    <EntityWriteProvider
      loaded={sheet.character}
      resolveContext={sheet.resolveContext}
    >
      <ViewerRoleProvider role="owner">{children}</ViewerRoleProvider>
    </EntityWriteProvider>
  )
}
