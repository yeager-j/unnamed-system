"use client"

import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import {
  BUILDER_STEPS,
  indexOfStep,
  type MovementSlug,
} from "@/domain/character/builder-steps"
import { CharacterRoot } from "@/domain/character/client"
import { setEntityBuilderStepAction } from "@/lib/actions/entity/builder-step"
import { guardWriteTransition } from "@/lib/actions/guard-write-transition"
import { characterBuilderPath } from "@/lib/paths"

/**
 * The shared chrome for every wizard movement (ADR-002 §5.2). A
 * chapter-style header (small mono Roman numeral on a short rule, large
 * serif title, italic serif framing line) sits above the movement's content;
 * a quiet footer below carries a named back-link, the four-movement progress
 * dots, and a named continue-link. The footer is sticky to the bottom of the
 * viewport so Continue stays reachable on tall movements (e.g. the Corpus
 * Archetype grid) without scrolling to the end.
 *
 * The footer also owns the wizard's navigation action. The continue link
 * calls `setEntityBuilderStepAction` before navigating so a returning player's
 * "Resume building" card deep-links to the right movement, and renders a
 * disabled-reason tooltip when `canAdvance={false}` so per-movement tickets
 * can gate progress on missing required inputs.
 */
export function BuilderShell({
  shortId,
  currentStepSlug,
  highestVisitedStepIndex,
  canAdvance = true,
  disabledReason,
  hideHeader = false,
  children,
}: {
  shortId: string
  currentStepSlug: MovementSlug
  highestVisitedStepIndex: number
  canAdvance?: boolean
  disabledReason?: string
  /**
   * Suppress the chapter header above the content. Movement 3 (the writer)
   * relocates the Roman / chapter title / framing line into the writer's
   * `<SidebarHeader>` so the full pane is left for the document — see
   * UNN-211.
   */
  hideHeader?: boolean
  children: ReactNode
}) {
  const currentIndex = indexOfStep(currentStepSlug) ?? 0
  const currentStep = BUILDER_STEPS[currentIndex]!
  const previousStep = BUILDER_STEPS[currentIndex - 1] ?? null
  const nextStep = BUILDER_STEPS[currentIndex + 1] ?? null

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-6 pt-6 lg:px-8 lg:pt-8">
      {hideHeader ? null : <ChapterHeader step={currentStep} />}

      <section className="flex flex-1 flex-col gap-6">{children}</section>

      <BuilderFooter
        shortId={shortId}
        currentIndex={currentIndex}
        highestVisitedStepIndex={highestVisitedStepIndex}
        previousStep={previousStep}
        nextStep={nextStep}
        canAdvance={canAdvance}
        disabledReason={disabledReason}
      />
    </main>
  )
}

function ChapterHeader({ step }: { step: (typeof BUILDER_STEPS)[number] }) {
  return (
    <header className="flex flex-col items-center gap-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <span
          aria-hidden
          className="text-center font-mono text-sm text-muted-foreground uppercase"
        >
          {step.romanNumeral}
        </span>
        <span aria-hidden className="h-px w-8 bg-border" />
      </div>

      <h1 className="font-display text-4xl font-semibold text-foreground sm:text-5xl">
        {step.label}
      </h1>

      {step.framingLine ? (
        <p className="font-heading text-base text-muted-foreground italic sm:text-lg">
          {step.framingLine}
        </p>
      ) : null}
    </header>
  )
}

function BuilderFooter({
  shortId,
  currentIndex,
  highestVisitedStepIndex,
  previousStep,
  nextStep,
  canAdvance,
  disabledReason,
}: {
  shortId: string
  currentIndex: number
  highestVisitedStepIndex: number
  previousStep: (typeof BUILDER_STEPS)[number] | null
  nextStep: (typeof BUILDER_STEPS)[number] | null
  canAdvance: boolean
  disabledReason?: string
}) {
  return (
    <footer
      aria-label="Builder navigation"
      className="sticky bottom-0 z-30 flex items-center gap-3 border-t border-border bg-background py-6 sm:gap-6"
    >
      <div className="flex flex-1 justify-start">
        {previousStep ? (
          <BackLink shortId={shortId} step={previousStep} />
        ) : (
          <span aria-hidden />
        )}
      </div>

      <ProgressDots
        shortId={shortId}
        currentIndex={currentIndex}
        highestVisitedStepIndex={highestVisitedStepIndex}
      />

      <div className="flex flex-1 justify-end">
        {nextStep ? (
          <ContinueLink
            shortId={shortId}
            nextIndex={currentIndex + 1}
            step={nextStep}
            canAdvance={canAdvance}
            disabledReason={disabledReason}
          />
        ) : (
          <span aria-hidden />
        )}
      </div>
    </footer>
  )
}

function BackLink({
  shortId,
  step,
}: {
  shortId: string
  step: (typeof BUILDER_STEPS)[number]
}) {
  return (
    <Button
      variant="link"
      size="lg"
      nativeButton={false}
      aria-label={`Back to ${step.label}`}
      render={<Link href={characterBuilderPath(shortId, step.slug)} />}
    >
      <ArrowLeftIcon weight="bold" className="size-3.5" />
      <span className="hidden sm:inline">{step.label}</span>
    </Button>
  )
}

function ContinueLink({
  shortId,
  nextIndex,
  step,
  canAdvance,
  disabledReason,
}: {
  shortId: string
  nextIndex: number
  step: (typeof BUILDER_STEPS)[number]
  canAdvance: boolean
  disabledReason?: string
}) {
  const { profile } = CharacterRoot.useRoot().value
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const disabled = isPending || !canAdvance

  function onClick() {
    if (!canAdvance) return
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await setEntityBuilderStepAction({
            entityId: profile.id,
            step: nextIndex,
          })
          if (!result.ok) {
            toast.error("Couldn't advance. Try again.")
            return
          }
          router.push(characterBuilderPath(shortId, step.slug))
        },
        () => toast.error("Couldn't advance. Try again.")
      )
    )
  }

  const button = (
    <Button
      variant="link"
      size="lg"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Continue to ${step.label}`}
    >
      <span className="hidden sm:inline">Continue to {step.label}</span>
      {isPending ? (
        <Spinner className="size-3.5" />
      ) : (
        <ArrowRightIcon weight="bold" className="size-3.5" />
      )}
    </Button>
  )

  if (!disabledReason || canAdvance) return button

  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} />}>{button}</TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  )
}

function ProgressDots({
  shortId,
  currentIndex,
  highestVisitedStepIndex,
}: {
  shortId: string
  currentIndex: number
  highestVisitedStepIndex: number
}) {
  return (
    <ol aria-label="Builder progress" className="flex items-center gap-3">
      {BUILDER_STEPS.map((step, index) => {
        const isCurrent = index === currentIndex
        const isVisited = index <= highestVisitedStepIndex && !isCurrent
        const label = `Movement ${index + 1} — ${step.label}`

        if (isCurrent) {
          return (
            <li key={step.slug}>
              <span
                aria-current="step"
                aria-label={label}
                className="block size-2 rounded-full bg-gold"
              />
            </li>
          )
        }

        if (isVisited) {
          return (
            <li key={step.slug}>
              <Link
                href={characterBuilderPath(shortId, step.slug)}
                aria-label={label}
                className="block size-2 rounded-full bg-muted-foreground/60 transition-colors hover:bg-foreground"
              />
            </li>
          )
        }

        return (
          <li key={step.slug}>
            <span
              aria-label={label}
              className="block size-2 rounded-full border border-muted-foreground/40"
            />
          </li>
        )
      })}
    </ol>
  )
}
