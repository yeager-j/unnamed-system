import { notFound } from "next/navigation"

import { AnimusStep } from "@/components/builder/animus"
import { BuilderShell } from "@/components/builder/builder-shell"
import {
  findStepGateFailures,
  nextGateForStep,
} from "@/components/builder/builder-step-gates"
import {
  indexOfStep,
  type MovementSlug,
} from "@/components/builder/builder-steps"
import { OrtusStep } from "@/components/builder/steps/ortus"
import { PersonaStep } from "@/components/builder/steps/persona"
import { TheBodyStep } from "@/components/builder/steps/the-body"
import { coerceVirtueAllocation } from "@/lib/game/virtues/allocation"

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
      characterId={character.id}
      shortId={shortId}
      currentStepSlug={slug}
      highestVisitedStepIndex={character.builderStep}
      identityVersion={character.identityVersion}
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
      return (
        <TheBodyStep
          characterId={character.id}
          pathChoice={character.pathChoice}
          originArchetypeKey={character.originArchetypeKey}
          identityVersion={character.identityVersion}
        />
      )
    case "ortus":
      return (
        <OrtusStep
          characterId={character.id}
          ancestryText={character.ancestryText}
          backgroundText={character.backgroundText}
          originArchetypeKey={character.originArchetypeKey}
          gainedTalents={character.gainedTalents}
          allocation={coerceVirtueAllocation({
            expression: character.virtueExpression,
            empathy: character.virtueEmpathy,
            wisdom: character.virtueWisdom,
            focus: character.virtueFocus,
          })}
          identityVersion={character.identityVersion}
        />
      )
    case "animus":
      return (
        <AnimusStep
          characterId={character.id}
          identityVersion={character.identityVersion}
          backstoryText={character.backstoryText}
          knives={character.knives}
          chains={character.chains}
          personalityTraits={character.personalityTraits}
          hopes={character.hopes}
          dreams={character.dreams}
          fears={character.fears}
          secrets={character.secrets}
        />
      )
    case "persona": {
      // Finalize must honor every gate, not just persona's name. A player
      // who skipped past Corpus without picking an Origin should see the
      // Finalize button disabled with the corpus reason surfaced.
      const failures = findStepGateFailures(character)
      return (
        <PersonaStep
          characterId={character.id}
          name={character.name}
          pronouns={character.pronouns}
          portraitUrl={character.portraitUrl}
          identityVersion={character.identityVersion}
          canFinalize={failures.length === 0}
          disabledReason={failures[0]?.reason}
        />
      )
    }
  }
}
