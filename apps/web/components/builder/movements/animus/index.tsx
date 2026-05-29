import type {
  CharacterChainRow,
  CharacterKnifeRow,
} from "@/lib/db/queries/load-character"

import { WriterPane } from "./writer-pane"

/**
 * Movement 3 — Animus (UNN-211). Renders the writer view's main pane.
 *
 * The sidebar half lives in
 * {@link import("../builder-provider-shell.tsx").BuilderProviderShell} so
 * the rail persists across intra-builder navigation (the layout doesn't
 * unmount on step change). This component owns the pane only.
 */
export function AnimusStep({
  characterId,
  identityVersion,
  backstoryText,
  knives,
  chains,
  personalityTraits,
  hopes,
  dreams,
  fears,
  secrets,
}: {
  characterId: string
  identityVersion: number
  backstoryText: string | null
  knives: readonly CharacterKnifeRow[]
  chains: readonly CharacterChainRow[]
  personalityTraits: string | null
  hopes: string | null
  dreams: string | null
  fears: string | null
  secrets: string | null
}) {
  return (
    <WriterPane
      characterId={characterId}
      identityVersion={identityVersion}
      backstoryText={backstoryText}
      knives={knives}
      chains={chains}
      personalityTraits={personalityTraits}
      hopes={hopes}
      dreams={dreams}
      fears={fears}
      secrets={secrets}
    />
  )
}
