import { HammerIcon } from "@phosphor-icons/react/dist/ssr"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

/**
 * Stand-in body for builder movements that haven't been implemented yet.
 * UNN-214 lands the shell with placeholders for every movement; the
 * per-movement tickets (UNN-215 → UNN-218) replace each placeholder with
 * real content. The `ticket` prop names the upcoming Linear issue so a
 * reviewer can trace which ticket fills the gap.
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
          This movement ships in {ticket}. Use the named back-link below, or tap
          a progress dot, to revisit an earlier movement.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
