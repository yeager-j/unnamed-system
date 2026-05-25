import { notFound } from "next/navigation"

import { BuilderNav } from "@/components/builder/builder-nav"
import { BuilderShell } from "@/components/builder/builder-shell"
import { nextGateForStep } from "@/components/builder/builder-step-gates"
import { indexOfStep } from "@/components/builder/builder-steps"
import { BasicInfoStep } from "@/components/builder/steps/basic-info"
import { CharacterOriginsStep } from "@/components/builder/steps/character-origins"
import { IdentityStep } from "@/components/builder/steps/identity"
import { PathAndArchetypeStep } from "@/components/builder/steps/path-and-archetype"
import { ReviewStep } from "@/components/builder/steps/review"

import { getBuilderCharacter, type BuilderCharacter } from "../_loader"

/**
 * Renders the body for a single builder step. The slug is validated
 * against `BUILDER_STEPS`; unknown slugs 404 so a typo in the URL doesn't
 * silently land on step 1. Only `basic-info` and `path-and-archetype` have
 * real bodies today — every other step renders the placeholder pointing at
 * the sibling ticket that owns it.
 *
 * The shell (header, blurb, stepper) is rendered here rather than in the
 * layout so the layout doesn't have to know the current step slug —
 * Next's layout API doesn't expose child segment params.
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

  const gate = nextGateForStep(step, character)

  return (
    <BuilderShell
      shortId={shortId}
      currentStepSlug={step}
      highestVisitedStepIndex={character.builderStep}
    >
      {renderStepBody({ step, character, shortId })}
      <BuilderNav
        characterId={character.id}
        shortId={shortId}
        currentIndex={currentIndex}
        identityVersion={character.identityVersion}
        canAdvance={gate.canAdvance}
        disabledReason={gate.canAdvance ? undefined : gate.reason}
      />
    </BuilderShell>
  )
}

function renderStepBody({
  step,
  character,
  shortId,
}: {
  step: string
  character: BuilderCharacter
  shortId: string
}) {
  switch (step) {
    case "basic-info":
      return (
        <BasicInfoStep
          characterId={character.id}
          name={character.name}
          pronouns={character.pronouns}
          portraitUrl={character.portraitUrl}
          identityVersion={character.identityVersion}
        />
      )
    case "path-and-archetype":
      return (
        <PathAndArchetypeStep
          characterId={character.id}
          pathChoice={character.pathChoice}
          originArchetypeKey={character.originArchetypeKey}
          identityVersion={character.identityVersion}
        />
      )
    case "character-origins":
      return (
        <CharacterOriginsStep
          characterId={character.id}
          identityVersion={character.identityVersion}
          serverVirtueAllocation={{
            expression: character.virtueExpression,
            empathy: character.virtueEmpathy,
            wisdom: character.virtueWisdom,
            focus: character.virtueFocus,
          }}
          ancestryText={character.ancestryText}
          backgroundText={character.backgroundText}
          backstoryText={character.backstoryText}
          knives={character.knives}
          chains={character.chains}
          originArchetypeKey={character.originArchetypeKey}
          gainedTalents={character.gainedTalents}
        />
      )
    case "identity":
      return (
        <IdentityStep
          characterId={character.id}
          identityVersion={character.identityVersion}
          personalityTraits={character.personalityTraits}
          hopes={character.hopes}
          dreams={character.dreams}
          fears={character.fears}
          secrets={character.secrets}
        />
      )
    case "review":
      return <ReviewStep character={character} shortId={shortId} />
    default:
      return null
  }
}
