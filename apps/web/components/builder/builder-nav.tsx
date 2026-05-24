"use client"

import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { setBuilderStepAction } from "@/lib/actions/character-identity"

import { BUILDER_STEPS, slugForStepIndex } from "./builder-steps"

/**
 * Prev / Next bar that lives at the bottom of every wizard step. On Next,
 * advances the row's `builderStep` cursor (so a "Resume building" card
 * deep-links to the right step) before navigating — done sequentially so
 * the new step's page renders with the bumped cursor already on the row.
 * Back navigates immediately; we don't rewind the cursor (it tracks the
 * high-water mark, which is what the resume affordance wants).
 *
 * **Required-field gating.** Steps that have a required field pass
 * `canAdvance={false}` until the field is populated (server-side prop),
 * which disables Next and shows `disabledReason` as a tooltip. The auto-
 * save hook + the builder route's revalidation make this an under-1s
 * round-trip in practice — the user types a name, the action lands, the
 * page revalidates, the prop updates, the button enables.
 */
export function BuilderNav({
  characterId,
  shortId,
  currentIndex,
  identityVersion,
  canAdvance = true,
  disabledReason,
}: {
  characterId: string
  shortId: string
  currentIndex: number
  identityVersion: number
  canAdvance?: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const previousSlug =
    currentIndex > 0 ? slugForStepIndex(currentIndex - 1) : null
  const nextIndex = currentIndex + 1
  const hasNext = nextIndex < BUILDER_STEPS.length
  const nextSlug = hasNext ? slugForStepIndex(nextIndex) : null
  const nextDisabled = isPending || !canAdvance

  function onNext() {
    if (!nextSlug || !canAdvance) return
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
      router.push(`/builder/${shortId}/${nextSlug}`)
    })
  }

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      {previousSlug ? (
        <Button
          variant="outline"
          disabled={isPending}
          nativeButton={false}
          render={<Link href={`/builder/${shortId}/${previousSlug}`} />}
        >
          <ArrowLeftIcon weight="bold" />
          Back
        </Button>
      ) : (
        <span />
      )}

      {hasNext ? (
        <NextButton
          onClick={onNext}
          disabled={nextDisabled}
          showSpinner={isPending}
          disabledReason={!canAdvance ? disabledReason : undefined}
        />
      ) : null}
    </div>
  )
}

/**
 * The Next button + its optional disabled-reason tooltip. Base UI tooltips
 * don't anchor to a `disabled` element (the disabled button doesn't
 * receive pointer events), so when there's a reason to show we wrap the
 * disabled button in a `<span>` that does.
 */
function NextButton({
  onClick,
  disabled,
  showSpinner,
  disabledReason,
}: {
  onClick: () => void
  disabled: boolean
  showSpinner: boolean
  disabledReason?: string
}) {
  const button = (
    <Button onClick={onClick} disabled={disabled}>
      {showSpinner ? <Spinner /> : null}
      Next
      {!showSpinner ? <ArrowRightIcon weight="bold" /> : null}
    </Button>
  )

  if (!disabledReason) return button

  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} />}>{button}</TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  )
}
