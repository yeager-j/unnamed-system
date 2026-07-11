import {
  actionAvailability,
  engagementCandidates,
  participantDisplayNames,
  type ActionAvailability,
  type OverlayComponents,
  type Participant,
  type ParticipantView,
  type ResolvedSession,
  type Session,
} from "@workspace/game-v2/encounter"
import { resolvedGuard } from "@workspace/game-v2/kernel/entity"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type {
  AffinityChart,
  AttributeScores,
} from "@workspace/game-v2/kernel/vocab"
import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import type { ResolvedSkill } from "@workspace/game-v2/skills/resolved"
import type { MapInstanceState, MapZone } from "@workspace/game-v2/spatial"
import { zoneOf } from "@workspace/game-v2/spatial/selectors"
import { isFallen } from "@workspace/game-v2/vitals/operations"

import type { ParticipantMeta } from "@/domain/combat/participant-meta"
import type { CombatantSheetSlice } from "@/domain/combat/sheet-slice"
import {
  combatantAvatar,
  type CombatantAvatar,
} from "@/domain/combat/view/avatar"
import {
  displayHome,
  type DisplayHome,
} from "@/domain/combat/view/display-home"
import type { Pool } from "@/domain/combat/view/pool"
import { hpPool, spPool } from "@/domain/combat/view/roster-view"
import {
  vitalsAffordances,
  type VitalsAffordances,
} from "@/domain/combat/view/vitals-affordances"
import { adjacentZones } from "@/domain/combat/view/zone-graph"
import {
  COMBATANT_CLASS_FALLBACKS,
  COMBATANT_DOWN_LABELS,
  COMBATANT_EDIT_SCOPE_NOTES,
} from "@/domain/labels"

/**
 * The per-combatant **drawer model** — a composition of one view per drawer
 * region, not a flat field bag: each section component takes exactly its slice.
 * The read-only stats are shaped **by capability**: `attributes`/`affinities`/
 * `hp`/`sp` are each `null` exactly when the entity resolves no such read-unit,
 * and the drawer renders a section iff its datum resolved.
 *
 * The loader's storage projection (`meta.storage`) **dies at {@link
 * displayHome}**: every PC-vs-enemy display question — avatar variant,
 * subtitle fallback, down label, edit-scope note, the setMax affordance — is
 * resolved here into a value by indexing a `{pc, enemy}`-keyed table, so no
 * storage boolean survives for the UI to re-branch on (the F1 leak). The
 * drawer receives display answers and one resolved Skills list, never the
 * storage tier or write tokens that produced them.
 */

export interface EngageableTarget {
  id: ParticipantId
  label: string
}

/** The drawer's engagement readout + control feed: the raw value, current
 *  targets resolved to display names, and the candidates it may engage —
 *  v2's allegiance-gated same-zone set, **plus** any current targets so an
 *  existing engagement is always clearable after a move. */
export interface CombatantEngagementView {
  value: Engagement
  targetNames: string[]
  candidates: EngageableTarget[]
}

/** The move control's feed: the occupied zone (`null` when unplaced) and the
 *  zones it may move to — adjacent when placed, every zone when unplaced (the
 *  mid-combat joiner placement affordance). `null` when the encounter defines
 *  no zones at all. */
export interface CombatantPosition {
  current: MapZone | null
  targets: MapZone[]
}

/** The drawer's header + footer display, every part pre-resolved. */
export interface CombatantHeader {
  name: string
  /** `Level N · Class · pronouns` (each part present iff known); an inline
   *  combatant with no class shows `Enemy`. */
  subtitle: string
  avatar: CombatantAvatar
  /** The footer's where-do-edits-land note — the one place the drawer talks
   *  about persistence, resolved to copy here. */
  persistenceNote: string
}

/** The vitals section's feed. `hp`/`sp` are `null` when the read-unit didn't
 *  resolve; `downLabel` is the Fallen/Dead badge, `null` while up. */
export interface CombatantVitalsView {
  hp: Pool | null
  sp: Pool | null
  downLabel: string | null
  affordances: VitalsAffordances
}

/** The read-only stat sections' feed (null/empty ⇔ the read-unit didn't
 *  resolve). `talentKeys: null` means the entity lacks the talents capability;
 *  `[]` means it has the capability but currently owns no Talents. */
export interface CombatantStats {
  attributes: AttributeScores | null
  affinities: AffinityChart | null
  skills: ResolvedSkill[]
  talentKeys: string[] | null
  hasSkillPool: boolean
}

export interface CombatantDetail {
  id: ParticipantId
  header: CombatantHeader
  /** The participant's editable session overlay, **verbatim** — the
   *  conditions/counters sections render and edit these engine values
   *  directly, so a new overlay field never threads through this model. */
  overlay: OverlayComponents
  actionAvailability: ActionAvailability
  position: CombatantPosition | null
  engagement: CombatantEngagementView
  vitals: CombatantVitalsView
  stats: CombatantStats
}

/** Builds the drawer model for one participant, or `null` for an unknown id. */
export function combatantDetail(
  session: Session,
  view: ResolvedSession,
  instanceState: MapInstanceState,
  participantId: ParticipantId,
  meta: ParticipantMeta | undefined,
  sheetSlice: CombatantSheetSlice | undefined
): CombatantDetail | null {
  const participant = session.participants.find((p) => p.id === participantId)
  const participantView = view.get(participantId)
  if (participant === undefined || participantView === undefined) return null

  const nameById = participantDisplayNames(view)
  const name = nameById.get(participantId) ?? participantId
  const home = displayHome(meta)

  return {
    id: participantId,
    header: combatantHeader(
      participant,
      participantView,
      name,
      home,
      sheetSlice
    ),
    overlay: participant.overlay,
    actionAvailability: actionAvailability(participant.overlay.turnState),
    position: combatantPosition(instanceState, participantId),
    engagement: engagementView(session, instanceState, participantId, nameById),
    vitals: combatantVitals(participantView, home),
    stats: combatantStats(participantView, sheetSlice),
  }
}

function combatantHeader(
  participant: Participant,
  participantView: ParticipantView,
  name: string,
  home: DisplayHome,
  sheetSlice: CombatantSheetSlice | undefined
): CombatantHeader {
  const level = participant.entity.components.level?.value
  const subtitle = [
    level !== undefined ? `Level ${level}` : null,
    sheetSlice?.className ?? COMBATANT_CLASS_FALLBACKS[home],
    sheetSlice?.pronouns ?? null,
  ]
    .filter(Boolean)
    .join(" · ")

  return {
    name,
    subtitle,
    avatar: combatantAvatar({
      home,
      portraitUrl: participantView.components.presentation?.portraitUrl ?? null,
      name,
      id: participant.id,
      side: participant.overlay.allegiance.side,
    }),
    persistenceNote: COMBATANT_EDIT_SCOPE_NOTES[home](name),
  }
}

function combatantVitals(
  participantView: ParticipantView,
  home: DisplayHome
): CombatantVitalsView {
  const vitals = participantView.components.vitals
  return {
    hp: hpPool(participantView),
    sp: spPool(participantView),
    downLabel:
      vitals !== undefined && isFallen(vitals)
        ? COMBATANT_DOWN_LABELS[home]
        : null,
    affordances: vitalsAffordances(
      home,
      resolvedGuard("resources")(participantView)
    ),
  }
}

function combatantStats(
  participantView: ParticipantView,
  sheetSlice: CombatantSheetSlice | undefined
): CombatantStats {
  const hasTalentCapability = resolvedGuard("talents")(participantView)
  return {
    attributes: participantView.components.attributes ?? null,
    affinities: participantView.components.affinities ?? null,
    skills: sheetSlice?.skills ?? participantView.components.skills ?? [],
    talentKeys: hasTalentCapability
      ? participantView.components.talents.map((talent) => talent.key)
      : null,
    hasSkillPool: resolvedGuard("skillPool")(participantView),
  }
}

function combatantPosition(
  instanceState: MapInstanceState,
  participantId: ParticipantId
): CombatantPosition | null {
  const zones = instanceState.geometry.zones
  if (Object.keys(zones).length === 0) return null
  const zoneId = zoneOf(instanceState, participantId)
  const current = zoneId !== undefined ? (zones[zoneId] ?? null) : null
  const targets = current
    ? adjacentZones(instanceState.geometry, current.id)
    : Object.values(zones)
  return { current, targets }
}

/**
 * One participant's engagement readout + candidate set — shared by the drawer
 * detail and the setup roster rows, so staged and live engagement offer the
 * same targets. Reads the token directly off occupancy (the same value the
 * loader's read-bag projects).
 */
export function engagementView(
  session: Session,
  instanceState: MapInstanceState,
  participantId: ParticipantId,
  nameById: Map<ParticipantId, string>
): CombatantEngagementView {
  const value: Engagement = instanceState.occupancy[participantId]
    ?.engagement ?? { status: "free" }
  const currentTargets =
    value.status === "engaged" ? value.targetCombatantIds : []

  const candidateIds = new Set<ParticipantId>([
    ...engagementCandidates(session, instanceState, participantId),
    ...currentTargets,
  ])

  return {
    value,
    targetNames: currentTargets.map((id) => nameById.get(id) ?? id),
    candidates: [...candidateIds].map((id) => ({
      id,
      label: nameById.get(id) ?? id,
    })),
  }
}
