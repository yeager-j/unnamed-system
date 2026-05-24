import { type ReactNode } from "react"

import { MobileStepperBar, VerticalStepperRail } from "./builder-stepper"
import { BUILDER_STEPS, indexOfStep } from "./builder-steps"

/**
 * Frame for every wizard step. Two-column layout at `lg:` and up — a
 * sticky vertical step rail on the left, the step title + blurb + body on
 * the right. Below `lg:` everything collapses into a single column with
 * the compact progress-bar variant on top.
 *
 * The shell lives inside the step `page.tsx` (not the route layout) so it
 * can read the current step slug; Next 16 layouts don't get child segment
 * params.
 */
export function BuilderShell({
  shortId,
  currentStepSlug,
  highestVisitedStepIndex,
  children,
}: {
  shortId: string
  currentStepSlug: string
  highestVisitedStepIndex: number
  children: ReactNode
}) {
  const currentIndex = indexOfStep(currentStepSlug) ?? 0
  const currentStep = BUILDER_STEPS[currentIndex]!

  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-8 p-6 lg:grid-cols-[200px_1fr] lg:gap-10">
      <aside className="hidden lg:block">
        <div className="sticky top-6">
          <VerticalStepperRail
            shortId={shortId}
            currentIndex={currentIndex}
            highestVisitedIndex={highestVisitedStepIndex}
          />
        </div>
      </aside>

      <div className="flex flex-col gap-6">
        <div className="lg:hidden">
          <MobileStepperBar
            shortId={shortId}
            currentIndex={currentIndex}
            highestVisitedIndex={highestVisitedStepIndex}
          />
        </div>

        <header className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold">
            {currentStep.label}
          </h1>
          <p className="text-sm text-muted-foreground">{currentStep.blurb}</p>
        </header>

        <section className="flex flex-col gap-6">{children}</section>
      </div>
    </main>
  )
}
