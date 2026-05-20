import { Badge } from "@workspace/ui/components/badge"
import { ItemGroup } from "@workspace/ui/components/item"
import { Separator } from "@workspace/ui/components/separator"
import {
  AFFINITY_DAMAGE_TYPES,
  type Affinity,
  type AffinityDamageType,
} from "@/lib/game/affinity"
import type { ArchetypeEntry, RankedSkill } from "@/lib/game/archetypes/entries"
import {
  ATTRIBUTE_KEYS,
  hasUnlockedRank,
  type Archetype,
} from "@/lib/game/archetypes/schema"
import { Prose } from "../prose"
import { SkillRow } from "../skill-row"
import { DetailSection } from "./detail-section"
import {
  AFFINITY_LABELS,
  ATTRIBUTE_SHORT_LABELS,
  DAMAGE_TYPE_LABELS,
  formatModifier,
  formatTalentLabel,
} from "./format"

/**
 * The rich, per-Archetype detail block — shared by the featured Active card on
 * the Archetypes tab and the per-Archetype Drawer launched from each compact
 * summary card. Renders every fact about one unlocked Archetype: attributes,
 * simplified affinity chart, talents, mechanic prose, the Skills grouped by
 * Rank (with the existing {@link SkillRow} popover for Skill detail), the
 * Synthesis Skill when unlocked at the current Rank, and Inheritance Slots
 * with their fillers. Read-only — no Switch/Rank-up/Unlock controls.
 *
 * `entry` arrives pre-resolved by the tab parent so this block (and the
 * compact summary alongside it) never re-do cross-Archetype lookups.
 */
export function ArchetypeDetail({ entry }: { entry: ArchetypeEntry }) {
  const { archetype, row } = entry
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ArchetypeAttributes archetype={archetype} />
        <ArchetypeAffinities archetype={archetype} />
      </div>

      <ArchetypeTalents archetype={archetype} />

      {archetype.mechanic ? (
        <>
          <Separator />
          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">
              {archetype.mechanic.displayName}
            </h3>
            <Prose>{archetype.mechanic.description}</Prose>
          </section>
        </>
      ) : null}

      <Separator />

      <ArchetypeRankedSkills entry={entry} />

      {entry.synthesis && hasUnlockedRank(row.rank, entry.synthesis.rank) ? (
        <DetailSection title="Synthesis Skill">
          <ItemGroup className="gap-0">
            <SkillRow skill={entry.synthesis} />
          </ItemGroup>
        </DetailSection>
      ) : null}

      <ArchetypeInheritanceSlots entry={entry} />
    </div>
  )
}

function ArchetypeAttributes({ archetype }: { archetype: Archetype }) {
  return (
    <DetailSection title="Attributes">
      <dl className="grid grid-cols-4 gap-2 text-center">
        {ATTRIBUTE_KEYS.map((key) => (
          <div
            key={key}
            className="flex flex-col gap-0.5 rounded-none border border-border p-2"
          >
            <dt className="text-xs text-muted-foreground">
              {ATTRIBUTE_SHORT_LABELS[key]}
            </dt>
            <dd className="text-base font-semibold tabular-nums">
              {formatModifier(archetype.attributes[key])}
            </dd>
          </div>
        ))}
      </dl>
    </DetailSection>
  )
}

function ArchetypeAffinities({ archetype }: { archetype: Archetype }) {
  const chips = AFFINITY_DAMAGE_TYPES.flatMap((type) => {
    const affinity = archetype.affinities[type]
    if (!affinity || affinity === "neutral") return []
    return [{ type, affinity }]
  })

  return (
    <DetailSection title="Affinities">
      {chips.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          All damage types Neutral.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chips.map(({ type, affinity }) => (
            <AffinityChip key={type} type={type} affinity={affinity} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Other damage types Neutral.
      </p>
    </DetailSection>
  )
}

function ArchetypeTalents({ archetype }: { archetype: Archetype }) {
  if (archetype.talents.length === 0) return null
  return (
    <DetailSection title="Talents">
      <div className="flex flex-wrap gap-1.5">
        {archetype.talents.map((talent) => (
          <Badge key={talent} variant="secondary">
            {formatTalentLabel(talent)}
          </Badge>
        ))}
      </div>
    </DetailSection>
  )
}

function ArchetypeRankedSkills({ entry }: { entry: ArchetypeEntry }) {
  const { ranks, row } = entry
  if (ranks.length === 0) return null

  const grouped = new Map<number, RankedSkill[]>()
  for (const ranked of ranks) {
    const bucket = grouped.get(ranked.rank) ?? []
    bucket.push(ranked)
    grouped.set(ranked.rank, bucket)
  }
  const sortedRanks = [...grouped.keys()].sort((a, b) => a - b)

  return (
    <DetailSection title="Skills" className="gap-3">
      {sortedRanks.map((rankNumber) => {
        const unlocked = hasUnlockedRank(row.rank, rankNumber)
        const skills = grouped.get(rankNumber) ?? []
        return (
          <div key={rankNumber} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-xs font-medium">Rank {rankNumber}</h4>
              {unlocked ? null : (
                <span className="text-xs text-muted-foreground italic">
                  Locked
                </span>
              )}
            </div>
            {unlocked ? (
              <ItemGroup className="gap-0">
                {skills.map((ranked) => (
                  <SkillRow key={ranked.key} skill={ranked} />
                ))}
              </ItemGroup>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((ranked) => (
                  <Badge
                    key={ranked.key}
                    variant="outline"
                    className="text-muted-foreground"
                  >
                    {ranked.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </DetailSection>
  )
}

function ArchetypeInheritanceSlots({ entry }: { entry: ArchetypeEntry }) {
  const { archetype, slots } = entry
  if (archetype.inheritanceSlots === 0) return null

  const total = archetype.inheritanceSlots
  const filled = slots.filter((slot) => slot.resolved !== null).length
  const ordered = [...slots].sort((a, b) => a.slotIndex - b.slotIndex)

  return (
    <DetailSection
      title="Inheritance Slots"
      aside={
        <span className="text-xs text-muted-foreground tabular-nums">
          {filled}/{total} filled
        </span>
      }
    >
      <ul className="flex flex-col gap-2">
        {Array.from({ length: total }).map((_, slotIndex) => {
          const slot = ordered.find((s) => s.slotIndex === slotIndex)
          return (
            <li
              key={slotIndex}
              className="rounded-none border border-border p-3"
            >
              {slot?.resolved ? (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    Slot {slotIndex + 1}
                    {slot.sourceArchetype
                      ? ` · from ${slot.sourceArchetype.name}`
                      : null}
                  </p>
                  <ItemGroup className="gap-0">
                    <SkillRow skill={slot.resolved} />
                  </ItemGroup>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs text-muted-foreground">
                    Slot {slotIndex + 1}
                  </p>
                  <p className="text-sm text-muted-foreground italic">
                    Empty slot
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </DetailSection>
  )
}

function AffinityChip({
  type,
  affinity,
}: {
  type: AffinityDamageType
  affinity: Exclude<Affinity, "neutral">
}) {
  return (
    <Badge
      variant="outline"
      className={
        affinity === "weak" ? "border-destructive/30 text-destructive" : ""
      }
    >
      {DAMAGE_TYPE_LABELS[type]} {AFFINITY_LABELS[affinity]}
    </Badge>
  )
}
