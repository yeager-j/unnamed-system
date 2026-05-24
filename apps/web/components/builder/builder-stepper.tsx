"use client"

import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Progress } from "@workspace/ui/components/progress"
import { cn } from "@workspace/ui/lib/utils"

import { BUILDER_STEPS } from "./builder-steps"

/**
 * Two responsive variants of the builder step indicator:
 *
 * - `VerticalStepperRail`: the desktop sidebar. A vertical list of
 *   numbered indicators + labels, with the current step accented and any
 *   visited step linked back. The rail is rendered by the shell at
 *   `lg:` breakpoints and up where there's plenty of horizontal room.
 * - `MobileStepperBar`: a compact progress bar + textual position +
 *   "Jump to step" dropdown for narrow viewports where a stacked
 *   sidebar would dominate the form.
 *
 * Both read from the shared `BUILDER_STEPS` constant and apply the same
 * "visited but not current" linkability rule so the two surfaces stay in
 * sync.
 */

interface StepperProps {
  shortId: string
  currentIndex: number
  highestVisitedIndex: number
}

export function VerticalStepperRail({
  shortId,
  currentIndex,
  highestVisitedIndex,
}: StepperProps) {
  return (
    <nav aria-label="Builder progress">
      <p className="mb-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
        New character
      </p>
      <ol className="flex flex-col gap-1">
        {BUILDER_STEPS.map((step, index) => {
          const isCurrent = index === currentIndex
          const isVisited = index <= highestVisitedIndex
          const isPrior = isVisited && !isCurrent

          const content = (
            <>
              <StepIndicator
                index={index}
                isCurrent={isCurrent}
                isPrior={isPrior}
              />
              <span
                className={cn(
                  "text-sm",
                  isCurrent
                    ? "font-medium text-foreground"
                    : isPrior
                      ? "text-foreground"
                      : "text-muted-foreground/70"
                )}
              >
                {step.label}
              </span>
            </>
          )

          const className = cn(
            "flex items-center gap-3 rounded-none px-2 py-2 transition-colors",
            isPrior
              ? "hover:bg-muted"
              : isCurrent
                ? "bg-muted"
                : "cursor-default"
          )

          return (
            <li key={step.slug}>
              {isPrior ? (
                <Link
                  href={`/builder/${shortId}/${step.slug}`}
                  className={className}
                >
                  {content}
                </Link>
              ) : (
                <div
                  className={className}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {content}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function MobileStepperBar({
  shortId,
  currentIndex,
  highestVisitedIndex,
}: StepperProps) {
  const totalSteps = BUILDER_STEPS.length
  const progressValue = ((currentIndex + 1) / totalSteps) * 100
  const currentLabel = BUILDER_STEPS[currentIndex]?.label ?? ""

  const jumpTargets = BUILDER_STEPS.flatMap((step, index) =>
    index !== currentIndex && index <= highestVisitedIndex
      ? [{ step, index }]
      : []
  )

  return (
    <nav aria-label="Builder progress" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          Step {currentIndex + 1} of {totalSteps}
          <span className="text-foreground"> · {currentLabel}</span>
        </span>
        {jumpTargets.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Jump to step
              <CaretDownIcon className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {jumpTargets.map(({ step, index }) => (
                <DropdownMenuItem
                  key={step.slug}
                  render={<Link href={`/builder/${shortId}/${step.slug}`} />}
                >
                  {index + 1}. {step.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <Progress value={progressValue} />
    </nav>
  )
}

function StepIndicator({
  index,
  isCurrent,
  isPrior,
}: {
  index: number
  isCurrent: boolean
  isPrior: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
        isCurrent
          ? "border-primary bg-primary text-primary-foreground"
          : isPrior
            ? "border-foreground/60 text-foreground"
            : "border-muted-foreground/40 text-muted-foreground/70"
      )}
    >
      {isPrior ? <CheckIcon weight="bold" className="size-3" /> : index + 1}
    </span>
  )
}
