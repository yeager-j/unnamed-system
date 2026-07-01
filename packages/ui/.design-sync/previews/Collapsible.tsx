import { CaretDownIcon } from "@phosphor-icons/react"

import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"

export function Default() {
  return (
    <Collapsible defaultOpen className="flex max-w-sm flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">Mastered Skills · 4</span>
        <CollapsibleTrigger
          render={
            <Button variant="ghost" size="icon-sm">
              <CaretDownIcon />
              <span className="sr-only">Toggle</span>
            </Button>
          }
        />
      </div>
      <div className="rounded-md border px-3 py-2 text-sm">Agi · 8 SP</div>
      <CollapsibleContent className="flex flex-col gap-2">
        <div className="rounded-md border px-3 py-2 text-sm">Bufu · 8 SP</div>
        <div className="rounded-md border px-3 py-2 text-sm">Dia · 6 SP</div>
        <div className="rounded-md border px-3 py-2 text-sm">
          Tarukaja · 12 SP
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
