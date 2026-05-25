import {
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import type { GateFailure } from "../../builder-step-gates"
import { BUILDER_STEPS } from "../../builder-steps"

/**
 * Validation summary that sits above the finalize button. Renders one of
 * two states:
 *
 * - **Looks good** — single green confirmation line. The finalize button
 *   below is enabled.
 * - **Blocked** — one row per failing gate, each with a "Fix in {Step}"
 *   link that deep-links back to the source step. The finalize button is
 *   disabled.
 *
 * Both states are rendered as a `Card` so the visual weight matches the
 * summary cards above it.
 */
export function ValidationSummary({
  shortId,
  failures,
}: {
  shortId: string
  failures: readonly GateFailure[]
}) {
  if (failures.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3">
          <CheckCircleIcon
            weight="fill"
            className="size-5 shrink-0 text-emerald-600 dark:text-emerald-500"
          />
          <p className="text-sm">
            Everything checks out — ready to create your character.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <WarningCircleIcon
            weight="fill"
            className="size-5 shrink-0 text-destructive"
          />
          Fix these before creating your character
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {failures.map((failure) => (
            <li
              key={failure.stepSlug}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
            >
              <span className="text-sm">{failure.reason}</span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-sm"
                nativeButton={false}
                render={
                  <Link href={`/builder/${shortId}/${failure.stepSlug}`}>
                    Fix in {labelFor(failure.stepSlug)} →
                  </Link>
                }
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function labelFor(slug: string): string {
  return BUILDER_STEPS.find((step) => step.slug === slug)?.label ?? slug
}
