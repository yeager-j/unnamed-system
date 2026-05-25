"use client"

import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { Spinner } from "@workspace/ui/components/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { setBuilderStepAction } from "@/lib/actions/character-identity"

import { BUILDER_STEPS, indexOfStep } from "./builder-steps"

/**
 * The shared chrome for every wizard movement (ADR-002 §5.2). A
 * chapter-style header (small mono Roman numeral on a short rule, large
 * serif title, italic serif framing line) sits above the movement's content;
 * a quiet footer below carries a named back-link, the four-movement progress
 * dots, and a named continue-link.
 *
 * The footer also owns the wizard's navigation action. The continue link
 * calls `setBuilderStepAction` before navigating so a returning player's
 * "Resume building" card deep-links to the right movement, and renders a
 * disabled-reason tooltip when `canAdvance={false}` so per-movement tickets
 * can gate progress on missing required inputs.
 */
export function BuilderShell({
  characterId,
  shortId,
  currentStepSlug,
  highestVisitedStepIndex,
  identityVersion,
  canAdvance = true,
  disabledReason,
  children,
}: {
  characterId: string
  shortId: string
  currentStepSlug: string
  highestVisitedStepIndex: number
  identityVersion: number
  canAdvance?: boolean
  disabledReason?: string
  children: ReactNode
}) {
  const currentIndex = indexOfStep(currentStepSlug) ?? 0
  const currentStep = BUILDER_STEPS[currentIndex]!
  const previousStep = currentIndex > 0 ? BUILDER_STEPS[currentIndex - 1] : null
  const nextStep =
    currentIndex + 1 < BUILDER_STEPS.length
      ? BUILDER_STEPS[currentIndex + 1]
      : null

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-6 py-12 lg:py-16">
      <ChapterHeader step={currentStep} />

      <section className="flex flex-1 flex-col gap-6">{children}</section>

      <BuilderFooter
        characterId={characterId}
        shortId={shortId}
        currentIndex={currentIndex}
        highestVisitedStepIndex={highestVisitedStepIndex}
        identityVersion={identityVersion}
        previousStep={previousStep ?? null}
        nextStep={nextStep ?? null}
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
          className="font-mono text-xs tracking-[0.4em] text-muted-foreground uppercase"
        >
          {step.romanNumeral}
        </span>
        <span aria-hidden className="h-px w-8 bg-border" />
      </div>

      <h1 className="font-heading text-4xl font-medium text-foreground sm:text-5xl">
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
  characterId,
  shortId,
  currentIndex,
  highestVisitedStepIndex,
  identityVersion,
  previousStep,
  nextStep,
  canAdvance,
  disabledReason,
}: {
  characterId: string
  shortId: string
  currentIndex: number
  highestVisitedStepIndex: number
  identityVersion: number
  previousStep: (typeof BUILDER_STEPS)[number] | null
  nextStep: (typeof BUILDER_STEPS)[number] | null
  canAdvance: boolean
  disabledReason?: string
}) {
  return (
    <footer
      aria-label="Builder navigation"
      className="mt-8 flex items-center gap-3 border-t border-border pt-6 sm:gap-6"
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
            characterId={characterId}
            shortId={shortId}
            nextIndex={currentIndex + 1}
            step={nextStep}
            identityVersion={identityVersion}
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
    <Link
      href={`/builder/${shortId}/${step.slug}`}
      aria-label={`Back to ${step.label}`}
      className="-mx-2 -my-1.5 inline-flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeftIcon weight="bold" className="size-3.5" />
      <span className="hidden sm:inline">{step.label}</span>
    </Link>
  )
}

function ContinueLink({
  characterId,
  shortId,
  nextIndex,
  step,
  identityVersion,
  canAdvance,
  disabledReason,
}: {
  characterId: string
  shortId: string
  nextIndex: number
  step: (typeof BUILDER_STEPS)[number]
  identityVersion: number
  canAdvance: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const disabled = isPending || !canAdvance

  function onClick() {
    if (!canAdvance) return
    startTransition(async () => {
      const result = await setBuilderStepAction({
        characterId,
        step: nextIndex,
        expectedVersion: identityVersion,
      })
      if (!result.ok && result.error !== "stale") {
        toast.error("Couldn't advance. Try again.")
        return
      }
      router.push(`/builder/${shortId}/${step.slug}`)
    })
  }

  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Continue to ${step.label}`}
      className={cn(
        "-mx-2 -my-1.5 inline-flex items-center gap-2 px-2 py-1.5 text-sm transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/50"
          : "text-foreground hover:text-primary"
      )}
    >
      <span className="hidden sm:inline">Continue to {step.label}</span>
      {isPending ? (
        <Spinner className="size-3.5" />
      ) : (
        <ArrowRightIcon weight="bold" className="size-3.5" />
      )}
    </button>
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
                className="block size-2 rounded-full bg-primary"
              />
            </li>
          )
        }

        if (isVisited) {
          return (
            <li key={step.slug}>
              <Link
                href={`/builder/${shortId}/${step.slug}`}
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
