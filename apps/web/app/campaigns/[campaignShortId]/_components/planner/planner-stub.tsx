import { HourglassIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

import { campaignPath } from "@/lib/paths"

/**
 * Shared body for the phase-1 planner stubs (Calendar, Chronicle): pre-clock
 * they point home to start the clock (D10 — "pre-clock Calendar/Chronicle
 * stubs point home"); post-clock they name what the surface will be.
 */
export function PlannerStub({
  surface,
  campaignShortId,
  clockStarted,
  comingCopy,
}: {
  surface: string
  campaignShortId: string
  clockStarted: boolean
  comingCopy: string
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HourglassIcon />
            </EmptyMedia>
            <EmptyTitle>
              {clockStarted
                ? `${surface} is on its way`
                : "The clock hasn't started"}
            </EmptyTitle>
            <EmptyDescription>
              {clockStarted
                ? comingCopy
                : `The ${surface} runs on the campaign clock. Start it from the Day Runner and come back.`}
            </EmptyDescription>
          </EmptyHeader>
          {!clockStarted ? (
            <EmptyContent>
              <Button
                render={<Link href={campaignPath(campaignShortId)} />}
                nativeButton={false}
              >
                Go to the Day Runner
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      </div>
    </div>
  )
}
