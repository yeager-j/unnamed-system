import { MaskHappyIcon, PlusIcon } from "@phosphor-icons/react"

import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

export function Default() {
  return (
    <Empty className="max-w-sm border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MaskHappyIcon />
        </EmptyMedia>
        <EmptyTitle>No characters yet</EmptyTitle>
        <EmptyDescription>
          Every performer needs a Persona. Roll a new one and take the stage.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>
          <PlusIcon />
          New character
        </Button>
      </EmptyContent>
    </Empty>
  )
}
