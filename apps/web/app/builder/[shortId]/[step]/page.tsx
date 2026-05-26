import { notFound } from "next/navigation"

import { BuilderShell } from "@/components/builder/builder-shell"
import { nextGateForStep } from "@/components/builder/builder-step-gates"
import { BUILDER_STEPS, indexOfStep } from "@/components/builder/builder-steps"
import { StepPlaceholder } from "@/components/builder/step-placeholder"
import { TheBodyStep } from "@/components/builder/steps/the-body"

import { getBuilderCharacter, type BuilderCharacter } from "../_loader"

/**
 * Renders the body for a single builder movement. The slug is validated
 * against `BUILDER_STEPS`; unknown slugs 404 so a typo in the URL doesn't
 * silently land on Movement 1.
 *
 * As each per-movement ticket lands its real content, the slug's branch in
 * {@link renderMovementBody} swaps `StepPlaceholder` for the movement's
 * component. The shell (chapter header + dots footer + named back/continue
 * links) wraps every movement so the layout doesn't have to read child
 * segment params — Next 16 layouts don't get those.
 */
const MOVEMENT_TICKETS: Record<string, string> = {
  corpus: "UNN-215",
  ortus: "UNN-216",
  animus: "UNN-217",
  persona: "UNN-218",
}

export default async function BuilderStepPage({
  params,
}: {
  params: Promise<{ shortId: string; step: string }>
}) {
  const { shortId, step } = await params
  const currentIndex = indexOfStep(step)
  if (currentIndex === null) notFound()

  const character = await getBuilderCharacter(shortId)
  if (!character) notFound()

  const gate = nextGateForStep(step, character)
  const currentStep = BUILDER_STEPS[currentIndex]!

  return (
    <BuilderShell
      characterId={character.id}
      shortId={shortId}
      currentStepSlug={step}
      highestVisitedStepIndex={character.builderStep}
      identityVersion={character.identityVersion}
      canAdvance={gate.canAdvance}
      disabledReason={gate.canAdvance ? undefined : gate.reason}
    >
      {renderMovementBody({ step, character, label: currentStep.label })}
    </BuilderShell>
  )
}

function renderMovementBody({
  step,
  character,
  label,
}: {
  step: string
  character: BuilderCharacter
  label: string
}) {
  switch (step) {
    case "corpus":
      return (
        <TheBodyStep
          characterId={character.id}
          pathChoice={character.pathChoice}
          originArchetypeKey={character.originArchetypeKey}
          identityVersion={character.identityVersion}
        />
      )
    default:
      return (
        <StepPlaceholder
          stepLabel={label}
          ticket={MOVEMENT_TICKETS[step] ?? "a follow-up ticket"}
        />
      )
  }
}
