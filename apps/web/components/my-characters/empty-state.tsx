import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"

import { CreateCharacterButton } from "./create-character-button"

/**
 * Shown when the signed-in viewer owns no characters yet. Built on shadcn's
 * `Empty` primitive so the panel matches the patterns used elsewhere in the
 * UI library and the dashed-border treatment makes the "nothing here yet"
 * affordance read clearly.
 */
export function EmptyCharacters() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>No characters yet</EmptyTitle>
        <EmptyDescription>
          The Character Builder is on its way. When it ships, your roster will
          start filling up here.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <CreateCharacterButton />
      </EmptyContent>
    </Empty>
  )
}
