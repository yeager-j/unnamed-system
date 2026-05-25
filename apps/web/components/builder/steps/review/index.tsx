import type { BuilderCharacter } from "@/app/builder/[shortId]/_loader"

import { findStepGateFailures } from "../../builder-step-gates"
import { BasicsSummary } from "./basics-summary"
import { FinalizeButton } from "./finalize-button"
import { IdentitySummary } from "./identity-summary"
import { KnivesChainsSummary } from "./knives-chains-summary"
import { NarrativeSummary } from "./narrative-summary"
import { PathArchetypeSummary } from "./path-archetype-summary"
import { TalentsSummary } from "./talents-summary"
import { ValidationSummary } from "./validation-summary"
import { VirtuesSummary } from "./virtues-summary"

/**
 * Step 5 of the builder — the Review & Confirm screen (PRD §5.1 step 5,
 * §5.2). A read-only summary of every prior step, organised so the
 * irreversible choices (HP/SP path, Origin Archetype) sit at the top with
 * the most ink and the editable-later sections (Knives, Chains, Identity)
 * collapse to conserve vertical space.
 *
 * Each summary section's "Edit" link deep-links back to its source step
 * so a player can correct anything. Finalization is enforced server-side
 * by {@link finalizeCharacterAction}; this component renders the
 * validation summary client-side as a guide so the player isn't surprised
 * by a disabled Create button.
 */
export function ReviewStep({
  character,
  shortId,
}: {
  character: BuilderCharacter
  shortId: string
}) {
  const failures = findStepGateFailures(character)

  return (
    <div className="flex flex-col gap-4">
      <PathArchetypeSummary
        shortId={shortId}
        pathChoice={character.pathChoice}
        originArchetypeKey={character.originArchetypeKey}
      />

      <BasicsSummary
        shortId={shortId}
        name={character.name}
        pronouns={character.pronouns}
        portraitUrl={character.portraitUrl}
      />

      <VirtuesSummary
        shortId={shortId}
        ranks={{
          expression: character.virtueExpression,
          empathy: character.virtueEmpathy,
          wisdom: character.virtueWisdom,
          focus: character.virtueFocus,
        }}
      />

      <TalentsSummary
        shortId={shortId}
        originArchetypeKey={character.originArchetypeKey}
        gainedTalents={character.gainedTalents}
      />

      <NarrativeSummary
        shortId={shortId}
        ancestryText={character.ancestryText}
        backgroundText={character.backgroundText}
        backstoryText={character.backstoryText}
      />

      <KnivesChainsSummary
        shortId={shortId}
        title="Knives"
        description="External stakes — what your character cares about."
        entries={character.knives}
      />

      <KnivesChainsSummary
        shortId={shortId}
        title="Chains"
        description="Internal limitations — what your character must overcome."
        entries={character.chains}
      />

      <IdentitySummary
        shortId={shortId}
        personalityTraits={character.personalityTraits}
        hopes={character.hopes}
        dreams={character.dreams}
        fears={character.fears}
        secrets={character.secrets}
      />

      <ValidationSummary shortId={shortId} failures={failures} />

      <FinalizeButton
        characterId={character.id}
        identityVersion={character.identityVersion}
        canFinalize={failures.length === 0}
      />
    </div>
  )
}
