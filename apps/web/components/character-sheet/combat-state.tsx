import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getAilment } from "@/lib/game/ailments"
import type { Lineage } from "@/lib/game/archetypes/schema"
import type {
  BattleConditions,
  BattleConditionState,
  PartyComposition,
} from "@/lib/game/character"
import type { HydratedCharacter } from "@/lib/game/hydrated-character"

import { LINEAGE_LABELS } from "./archetypes/lineage-labels"

/**
 * The read-only Combat State block (PRD §6.1 Combat tab > Combat State): the
 * tracked, non-derived modifiers a player needs to see at a glance during
 * play — current Ailment(s) with their canonical effect text, the three
 * Battle Condition axes (Attack / Defense / Hit-Evasion), single-use Charged
 * and Concentrating flags, and current Exhaustion. Designed for fast scanning:
 * neutral axes recede, changes are emphasised; inactive flags vanish entirely.
 * The "Clear combat state" mutator and any per-field controls are owner-mode
 * and intentionally not surfaced here.
 *
 * Battle Condition `stacks` are not displayed: rulebook 3.8 forbids
 * constructive stacking, so `stacks > 1` only encodes extended duration —
 * meaningful once an initiative tracker exists, not before.
 */
export function CombatState({ character }: { character: HydratedCharacter }) {
  const conditions: BattleConditions = character.battleConditions ?? {
    attack: { state: "neutral", stacks: 0 },
    defense: { state: "neutral", stacks: 0 },
    hitEvasion: { state: "neutral", stacks: 0 },
    charged: false,
    concentrating: false,
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Combat State</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AilmentList ailmentKeys={character.ailments} />
        <BattleConditionRow conditions={conditions} />
        <FlagRow
          charged={conditions.charged}
          concentrating={conditions.concentrating}
        />
        <PartyCompositionRow composition={character.partyComposition} />
        <ExhaustionRow exhaustion={character.exhaustion} />
      </CardContent>
    </Card>
  )
}

function AilmentList({ ailmentKeys }: { ailmentKeys: readonly string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Ailment
      </p>
      {ailmentKeys.length === 0 ? (
        <p aria-label="No ailment" className="text-sm text-muted-foreground">
          —
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {ailmentKeys.map((key) => {
            const canonical = getAilment(key)
            return (
              <li key={key} className="flex flex-col gap-0.5">
                <span className="font-medium text-destructive">
                  {canonical?.name ?? key}
                </span>
                {canonical ? (
                  <span className="text-muted-foreground">
                    {canonical.description}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const AXES = [
  { key: "attack", label: "Attack" },
  { key: "defense", label: "Defense" },
  { key: "hitEvasion", label: "Hit/Evasion" },
] as const

function BattleConditionRow({ conditions }: { conditions: BattleConditions }) {
  return (
    <dl className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
      {AXES.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {label}
          </dt>
          <dd>
            <ConditionValue state={conditions[key].state} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

const CONDITION_LABEL: Record<BattleConditionState, string> = {
  neutral: "Neutral",
  increased: "Increased",
  decreased: "Decreased",
}

function ConditionValue({ state }: { state: BattleConditionState }) {
  if (state === "neutral") {
    return <span className="text-muted-foreground">Neutral</span>
  }
  const Icon = state === "increased" ? CaretUpIcon : CaretDownIcon
  const tone =
    state === "increased" ? "font-medium" : "font-medium text-destructive"
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      {CONDITION_LABEL[state]}
      <Icon weight="bold" aria-hidden className="size-3.5" />
    </span>
  )
}

function FlagRow({
  charged,
  concentrating,
}: {
  charged: boolean
  concentrating: boolean
}) {
  if (!charged && !concentrating) return null
  return (
    <div className="flex flex-wrap gap-2">
      {charged ? <Badge variant="secondary">Charged</Badge> : null}
      {concentrating ? <Badge variant="secondary">Concentrating</Badge> : null}
    </div>
  )
}

/**
 * Read-only display of the allied Lineage counts present in the current
 * combat encounter — read by the `perPartyLineage` Attack Roll scaler (Magic
 * Circle, Ailment Boost). One row per Lineage with a non-zero count; an
 * em-dash when the map is empty or null.
 *
 * Scaffolding: this whole sub-block is temporary. Remove once the party
 * editor / initiative tracker lands and owns the authoritative composition;
 * the field's data shape does not need to change.
 */
function PartyCompositionRow({
  composition,
}: {
  composition: PartyComposition | null
}) {
  // TODO(UNN-192): remove this read-only block when the party editor /
  // initiative tracker lands.
  const entries = Object.entries(composition ?? {})
    .filter(([, count]) => typeof count === "number" && count > 0)
    .sort(([a], [b]) => a.localeCompare(b)) as [Lineage, number][]
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Party
      </p>
      {entries.length === 0 ? (
        <p
          aria-label="No party composition"
          className="text-sm text-muted-foreground"
        >
          —
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-sm">
          {entries.map(([lineage, count]) => (
            <li
              key={lineage}
              className="flex items-baseline justify-between gap-2"
            >
              <span>{LINEAGE_LABELS[lineage]}</span>
              <span className="font-mono text-muted-foreground tabular-nums">
                {count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ExhaustionRow({ exhaustion }: { exhaustion: number }) {
  const exhausted = exhaustion > 0
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-muted-foreground">Exhaustion</span>
      <span
        className={
          exhausted
            ? "font-medium tabular-nums"
            : "text-muted-foreground tabular-nums"
        }
      >
        {exhaustion}
      </span>
    </div>
  )
}
