import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import {
  AFFINITY_DAMAGE_TYPES,
  type Affinity,
  type AffinityDamageType,
} from "@/lib/game/affinity"
import type { HydratedCharacter } from "@/lib/game/hydrated-character"

type ChartedAffinity = Exclude<Affinity, "neutral">

/**
 * The read-only Affinity chart (PRD §6.1 / §7.1): all 11 damage types with
 * their engine-resolved Affinity (priority already applied upstream). Almighty
 * is structurally excluded — it never has a chart entry. Each Affinity is
 * spelled out as a word, not color alone, so the chart stays legible for
 * colorblind users; Weak is additionally tinted as the one value a player most
 * needs to spot at a glance. Neutral renders as "—". Laid out as a horizontal
 * strip — damage type stacked over its value — that fits all 11 on one row at
 * desktop width and wraps on narrower screens. No controls; the public sheet
 * never mutates state.
 */
export function Affinities({ character }: { character: HydratedCharacter }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Affinities</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-4 gap-x-2 gap-y-3 text-center sm:grid-cols-6 lg:grid-cols-11">
          {AFFINITY_DAMAGE_TYPES.map((type) => {
            const affinity = character.affinityChart[type]
            return (
              <div key={type} className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">
                  {DAMAGE_TYPE_LABELS[type]}
                </dt>
                <dd>
                  {affinity === "neutral" ? (
                    <span
                      className="text-muted-foreground"
                      aria-label="Neutral"
                    >
                      —
                    </span>
                  ) : (
                    <span
                      className={
                        affinity === "weak"
                          ? "font-medium text-destructive"
                          : "font-medium"
                      }
                    >
                      {AFFINITY_LABELS[affinity]}
                    </span>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      </CardContent>
    </Card>
  )
}

const DAMAGE_TYPE_LABELS: Record<AffinityDamageType, string> = {
  slash: "Slash",
  pierce: "Pierce",
  strike: "Strike",
  fire: "Fire",
  ice: "Ice",
  wind: "Wind",
  elec: "Elec",
  aether: "Aether",
  psy: "Psy",
  light: "Light",
  dark: "Dark",
}

const AFFINITY_LABELS: Record<ChartedAffinity, string> = {
  weak: "Weak",
  resist: "Resist",
  null: "Null",
  repel: "Repel",
  drain: "Drain",
}
