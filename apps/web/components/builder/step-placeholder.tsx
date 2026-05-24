import { HammerIcon } from "@phosphor-icons/react/dist/ssr"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

/**
 * Stand-in body for builder steps that haven't been implemented yet — used
 * by every wizard step except `basic-info` in this ticket. The
 * `ticket` prop renders the upcoming Linear issue so a reviewer can trace
 * which ticket fills the gap without grepping for the slug.
 */
export function StepPlaceholder({
  stepLabel,
  ticket,
}: {
  stepLabel: string
  ticket: string
}) {
  return (
    <Empty className="my-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HammerIcon weight="duotone" />
        </EmptyMedia>
        <EmptyTitle>{stepLabel} is coming soon</EmptyTitle>
        <EmptyDescription>
          This step ships in {ticket}. Use Back to return to a step that&apos;s
          ready, or jump to it from the step indicator above.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
