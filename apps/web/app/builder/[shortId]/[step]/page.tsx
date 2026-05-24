import { notFound } from "next/navigation"

import { BuilderNav } from "@/components/builder/builder-nav"
import { BuilderShell } from "@/components/builder/builder-shell"
import { BUILDER_STEPS, indexOfStep } from "@/components/builder/builder-steps"
import { StepPlaceholder } from "@/components/builder/step-placeholder"
import { BasicInfoStep } from "@/components/builder/steps/basic-info"
import { PathAndArchetypeStep } from "@/components/builder/steps/path-and-archetype"
import { DRAFT_NAME_PLACEHOLDER } from "@/lib/db/start-character-draft"

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
      {renderStepBody({ step, character })}
      <BuilderNav
        characterId={character.id}
        shortId={shortId}
        currentIndex={currentIndex}
        identityVersion={character.identityVersion}
        canAdvance={gate.canAdvance}
        disabledReason={gate.reason}
      />
    </BuilderShell>
  )
}

/**
 * Per-step "can the player advance from here?" rule, applied to the Next
 * button. Required-field rules come straight from PRD §5.2: name, HP/SP
 * path, Origin, and Virtue allocation are the only hard requirements;
 * everything else is encouraged but optional. Steps without a rule return
 * `{ canAdvance: true }`.
 *
 * The check reads server-rendered props, so a just-typed field doesn't
 * unlock Next until the auto-save lands and `revalidateCharacter` refreshes
 * the route (typically under a second). That's deliberate — Next being
 * disabled until the save lands doubles as confirmation that the typed
 * value persisted.
 */
function nextGateForStep(
  step: string,
  character: BuilderCharacter
): { canAdvance: boolean; reason?: string } {
  switch (step) {
    case "basic-info": {
      // Fresh drafts seed with `DRAFT_NAME_PLACEHOLDER`. The empty-string
      // branch covers pre-existing rows from before that seed landed; the
      // auto-save hook's `isEmpty` revert keeps the input from sitting
      // empty in normal use, so a real player only ever trips this on the
      // placeholder.
      const trimmed = character.name.trim()
      if (trimmed.length === 0 || trimmed === DRAFT_NAME_PLACEHOLDER) {
        return {
          canAdvance: false,
          reason: "Give your character a name to continue.",
        }
      }
      return { canAdvance: true }
    }
    case "path-and-archetype": {
      // pathChoice is pre-seeded "balanced", so it's always satisfied —
      // only Origin gates Next here.
      if (character.originArchetypeKey === null) {
        return {
          canAdvance: false,
          reason: "Pick an Origin Archetype to continue.",
        }
      }
      return { canAdvance: true }
    }
    default:
      return { canAdvance: true }
  }
}

function renderStepBody({
  step,
  character,
}: {
  step: string
  character: BuilderCharacter
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
    case "background":
      return (
        <StepPlaceholder
          stepLabel={labelFor(step)}
          ticket="UNN-205 / UNN-207"
        />
      )
    case "identity":
      return <StepPlaceholder stepLabel={labelFor(step)} ticket="UNN-207" />
    case "review":
      return <StepPlaceholder stepLabel={labelFor(step)} ticket="UNN-206" />
    default:
      return null
  }
}

function labelFor(slug: string): string {
  return BUILDER_STEPS.find((s) => s.slug === slug)?.label ?? slug
}
