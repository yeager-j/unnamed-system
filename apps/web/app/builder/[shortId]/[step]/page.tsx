import { notFound } from "next/navigation"

import { BuilderShell } from "@/components/builder/builder-shell"
import {
  findStepGateFailures,
  nextGateForStep,
} from "@/components/builder/builder-step-gates"
import {
  indexOfStep,
  type MovementSlug,
} from "@/components/builder/builder-steps"
import { AnimusStep } from "@/components/builder/movements/animus"
import { CorpusStep } from "@/components/builder/movements/corpus"
import { OrtusStep } from "@/components/builder/movements/ortus"
import { PersonaStep } from "@/components/builder/movements/persona"

import { getBuilderCharacter, type BuilderCharacter } from "../_loader"

/**
 * Renders the body for a single builder movement. The slug is validated
 * against `BUILDER_STEPS` via `indexOfStep`; unknown slugs 404 above so a
 * typo in the URL doesn't silently land on Movement 1. The shell (chapter
 * header + dots footer + named back/continue links) wraps every movement
 * so the layout doesn't have to read child segment params — Next 16
 * layouts don't get those.
 */
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

  const slug = step as MovementSlug
  const gate = nextGateForStep(slug, character)

  return (
    <BuilderShell
      shortId={shortId}
      currentStepSlug={slug}
      highestVisitedStepIndex={character.builderStep}
      canAdvance={gate.canAdvance}
      disabledReason={gate.canAdvance ? undefined : gate.reason}
      hideHeader={slug === "animus"}
    >
      {renderMovementBody({ slug, character })}
    </BuilderShell>
  )
}

function renderMovementBody({
  slug,
  character,
}: {
  slug: MovementSlug
  character: BuilderCharacter
}) {
  switch (slug) {
    case "corpus":
      return <CorpusStep />
    case "ortus":
      return <OrtusStep />
    case "animus":
      return <AnimusStep />
    case "persona": {
      // Finalize must honor every gate, not just persona's name. Computed
      // here (Server Component) and passed down so `PersonaStep` need not be
      // a client component — see its JSDoc for the hydration reason.
      const failures = findStepGateFailures(character)
      return (
        <PersonaStep
          canFinalize={failures.length === 0}
          disabledReason={failures[0]?.reason}
        />
      )
    }
  }
}
