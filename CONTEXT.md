# CONTEXT — ubiquitous language

Glossary of domain terms. Definitions only — no implementation detail. Terms
are added as they are resolved in design sessions; a term that conflicts with
usage in conversation should be challenged against this file.

## Campaign Clock

- **Day** — a point on a campaign's clock, identified by a plain number
  (Day 14). Days are not things that exist on their own; they are positions
  that facts (slots, dated Articles, updates, season markers) attach to.
- **Current day** — the single day the campaign is *on*. Advancing moves it
  forward; un-advancing moves it back one day.
- **Horizon** — the furthest day the DM has planned out to. The Calendar shows
  current day → horizon; "Add days" extends it.
- **Slot** — one substantial stretch of a day (Morning, Evening, …), ordered
  within its day. The DM can rename a day's slots or add more to that day.
- **Slot kind (derived)** — a slot with a beat scheduled into it is a **story
  slot**; a slot claimed by a dungeon is a **dungeon slot** (both
  campaign-wide, one resolved check); otherwise it is a **downtime slot**
  (one activity per placed character). Kind is never stored.
- **Dungeon slot claim** — the DM assigns a dungeon to a slot ("the delve
  takes the morning"), same gesture as running a story beat. Never enforced
  to take the whole day: if the party runs long, the DM claims the next slot
  with the same dungeon. The claim is planner-side; the dungeon console never
  moves the clock.
- **Idle** — the downtime category for "did nothing substantial": a one-click
  mark per character, muted in the Chronicle. Accepting empty slots at
  day-end fills the gaps with Idle entries.
- **Day structure** — a campaign's default slot layout (default
  Morning/Evening), applied to newly planned days. Editing it affects only
  days planned after the edit; already-planned days keep their slots.
- **Beat** — a prepped narrative scene (one Session Note). Prep, not history:
  beats are not participants, accrue no timeline, and never auto-log.
- **Schedule (of a beat)** — exactly one of: a concrete slot, **floating**
  ("run anytime"), or **unscheduled**.
- **Season** — a sparse inherit-forward day label ("Late Thaw"): set on a day,
  it holds until the next season marker.
- **Dated Article** — an Article carrying at most one date: an inert **event**
  on its day, or a **deadline** that looms, comes due (hard-gating the
  advance), and resolves. The dated thing is always the event/threat; agents
  are linked participants, never the dated thing.
- **Story tier** — the campaign-wide arc tier (0–4), advanced by the DM at
  story milestones. The party's shared journey: it opens each character's
  *own* Origin Lineage tier by tier, the way collaborator bonds open
  everyone else's (the Persona "Fool = the party" idea).

## The Living World

- **Participant** — anything that can sit in the relation web and accrue a
  timeline: an Article, an NPC, or a placed character. Referenced everywhere
  as a kind + id pair; the machinery is blind to kind.
- **Article** — a soft worldbuilding entry: a name, a label-only type, prose.
  Earns depth by accumulating updates, not form fields.
- **NPC** — a distinct structured kind: name required; Identity/Origins,
  Arcana, Lineage, and the party-wide bond fill in progressively. A name-only
  stub is a legitimate NPC. Within a campaign, at most one NPC holds any given
  Lineage (Persona-style: one collaborator per gift).
- **Update** — the timeline unit: day-stamped, authored on a primary
  participant, echoing to the participants it *concerns* — and nowhere else
  (the relation web never propagates updates). A downtime activity *is* an
  update; there is no separate activity log.
- **Concerns** — an update's explicit set of other participants it lands on.
- **Relation** — a directed, free-labeled edge in the static world web,
  displayed on its source. "Bidirectional" just writes the reverse edge too.
- **Chronicle** — the aggregate past-facing world timeline (all updates);
  each participant's page shows its own slice.
- **Bond** — the party's standing with an NPC: a tier (0–4, matching the four
  Archetype tiers), advanced by DM confirmation, manually adjustable, never
  automatic. Campaign world state, not character state.
- **Tombstone** — a deleted participant that history still points at: the
  record persists, renders muted in timelines, and leaves the linker, lists,
  and relation web.
