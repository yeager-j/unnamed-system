# Showtime! — Project Index

A tabletop RPG system heavily inspired by the Persona video game series. Turn-based, narrative-driven combat with an Extra Turn / Baton Pass mechanic, Affinity Charts, Archetypes (job classes), and a story-driven level advancement system.

## Updating Instructions

This Obsidian vault is also a git repository. When updating this file:
1. Run `git diff --name-only <hash> HEAD` to view the files that have been updated, where `<hash>` is the Last Updated Commit below. Also check for any uncommitted files!
2. Read those files and compare the content to what is described in this file. Don't worry about changes to Archetype or Skills, only look at the rules under Players and Dungeon Masters.
3. Update this file with the changes. Don't bother referring to past content; keep this file as a source of truth, not a history. Write changes however is most helpful to **you, the AI**. This file is not user-facing.
4. When you're done, the user will create a commit and update the hash below.

**Last Updated Commit:** `42d68d263d3e4d263294223b35461680698386ae`

## File Structure

### 1. Players/

| File                                                               | Contents                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1. Players/Overview.md`                                              | Table of contents linking to all player-facing chapters                                                                                                                                                                                                                                                                       |
| `1. Players/1. Character Building/1.1 HP and SP.md`                   | Hit Die / Skill Die paths (Health-Focused, Balanced, Skill-Focused), starting values, leveling; **max level 30**                                                                                                                                                                                                              |
| `1. Players/1. Character Building/1.2 Attributes and Virtues.md`      | Attributes (−7 to +7, set by active Archetype); Virtues (Rank 0–7; Rank 0 = below average, Rank 1 = average); creation rules (+2 one Virtue, +1 two others); Spark-based Virtue ranking; DM may also grant Sparks mid-play for demonstrating a Virtue; Higher Level Characters section is todo                               |
| `1. Players/1. Character Building/1.3 Archetypes.md`                  | Lineages, prerequisites, Affinities, Synthesis Skills (on Archetype page: cannot be inherited), Inheritance Slots, Availability (DM gates Lineages/tiers behind narrative), Tiers (Initiate/Adept/Elite/Paragon), Paragon tier (4th; one per character; same Lineage as Origin; requires Lineage prereqs + breaking all Chains; cannot unlock Paragon of a different Lineage), optional level-gate advancement (Adept 8, Elite 16, Paragon 24), advancement rules, Origin at creation; switch Archetypes at Respite |
| `1. Players/1. Character Building/1.4 Character Origins.md`           | Ancestry/Background (setting-dependent), Backstory, Knives (~7 at creation; external stakes/hooks), Chains (internal limitations; broken through narrative growth; **can be gained through play** via trauma/betrayal/loss)                                                                                                    |
| `1. Players/1. Character Building/1.5 Character Identity.md`          | Identity Traits: Personality Traits, Hopes, Dreams, Fears, Secrets — built after Knives/Chains are settled                                                                                                                                                                                                                    |
| `1. Players/1. Character Building/1.6 Level Advancement.md`           | Victories, Heroic Victories, 7-Victory threshold, level-up summary; note that **Virtues are not tied to character level**                                                                                                                                                                                                     |
| `1. Players/2. Playing the Game/2.1 Talent Tests.md`                  | Talent Tests (d20 + Attribute score OR Virtue Rank, +3 if a Talent applies); Talent list; no fixed stat-Talent pairing; no auto-fail/succeed; Virtue Gates; combining Gates and Tests; callouts: DM's Role (don't call for your own Tests), Failed Empathy Tests (tell player "can't get a read", not "you believe them"), Partial Failures |
| `1. Players/2. Playing the Game/2.2 Time Management.md`               | Two daily time slots (morning/evening); three activity categories (Virtue, Collaborator, Practical); travel times by method (walking, horses, ships, trains); Dungeon Turns (10-min increments, 48-turn / 8-hour limit before Exhaustion triggers); Respite = 20 min / 2 dungeon turns                                        |
| `1. Players/2. Playing the Game/2.3 Social Interaction.md`            | NPC attitudes; Roleplaying advice (making in-character choices, acting vs. narrating, metagaming); Collaborators intro (Lineage unlocks, Victory source, downtime); full Negotiation rules (Interest/Patience, Motivations/Pitfalls, argument resolution, final offers, Lying rule, Continuing/Walking Away, Time Management note); **Shared Language**: if 1 player shares a non-standard language with the NPC, Patience starts +1; if 3+, Patience starts +2 (max 6) |
| `1. Players/2. Playing the Game/2.4 Exploration.md`                   | Hex travel (4 hexes/day); when to use hex grid (unmapped discovery) vs. node-and-edge map (known world); still incomplete                                                                                                                                                                                                     |
| `1. Players/2. Playing the Game/2.5 Resting & Exhaustion.md`          | Full Rest (8 hrs safe location, all HP/SP, all dice, Exhaustion −1); Partial Rest (6–8 hrs shelter, all HP, roll Skill Dice for SP); Respite (20 min / 2 dungeon turns, roll Hit Dice for HP only, no SP); Exhaustion table pending                                                                                           |
| `1. Players/2. Playing the Game/2.6 Prisma & Prismatic Upgrades.md`   | Prisma healing flask: 2 charges base, 2d8+4 HP per charge, Standard Action to drink; can administer to ally in same Zone (Fallen ally only revived if flask is upgraded for it); refills at Full Rest; 5-color upgrade tree (Red = more HP, Yellow = more charges, Green = ailment curing/warding, Blue = Battle Condition buff, Purple = SP recovery); upgrade tree entries still todo |
| `1. Players/3. Combat/3.1 Introduction to Combat.md`                  | Brief intro; gridless combat overview; **Types of Actions**: Standard Action, Move Action, Reaction — Follow-Ups grant only a Standard Action (no Move/Reaction); Reactions only restored at start of a normal turn                                                                                                           |
| `1. Players/3. Combat/3.2 Initiating Combat & Turn Order.md`          | **Ambush**: d20 + diff between sides' highest Agility scores; succeeds on total 11+; natural 20 = auto-succeed, natural 1 = auto-fail (counter-ambush); environment may grant Advantage/Disadvantage or make ambush impossible. **Successful ambush**: ambushing side takes all their turns before the other side acts; normal turn order resumes after. **Turn Order**: side-based drafting — side with highest single Agility acts first every round (tiebreak: highest Luck; still tied: DM rolls d20, 11+ = players first); within each round, sides alternate picking one combatant to act; a combatant can't go twice until all allies have acted; if one side runs out of combatants first, the other side finishes back-to-back; Fallen combatants skip turns until revived; new combatants joining mid-round act at start of the next round |
| `1. Players/3. Combat/3.3 On Your Turn.md`                            | Move + Action structure; full attack sequence (Skill costs, Attack Roll, Crits, Ailments, Damage); **natural 1 = always miss; natural 20 = always best result**; multi-attribute Skills use highest; multi-target/multi-hit rules (table); Skills with durations (decrement at end of **target's** turn); Skills targeting allies (caster is valid target); Guard action; Communicating; **Insta-Kill** side effect (Luck check; target immune if their level ≥ caster's; auto if target is Weak to the type) |
| `1. Players/3. Combat/3.4 Affinities & Damage Types.md`               | Six affinities (Neutral/Weak/Resist/Null/Repel/Drain), priority rules, Almighty, Affinity Charts                                                                                                                                                                                                                              |
| `1. Players/3. Combat/3.5 Zones & Movement.md`                        | Zones (~30 ft regions, adjacency); Engaged/Free status; Movement actions (Travel, Engage, Approach); Disengage action; Opportunity Attacks; Interception; Range categories (Engaged/**All Engaged**/Same Zone/Same+Adjacent/Adjacent/**All**); explicit distance ranges supported (e.g., "up to 2 Zones away", "1–3 Zones away"); capped and uncapped AOEs; **Casting Recklessly** raises cap but catches **one ally of your choice** in the blast |
| `1. Players/3. Combat/3.6 Follow-Ups, Shifting, & All-Out Attacks.md` | Follow-Ups on Down (Standard Action only, no Move or Reaction); edge cases (Down + Downed simultaneously on same attack = no Follow-Up); Shifts; All-Out Attacks (combined Almighty damage to all enemies; Ailment/Fallen characters excluded); Synthesis Skills: all participants must be **healthy (no Ailment, not Fallen)**; combined damage; only enemies that took damage lose Downed status |
| `1. Players/3. Combat/3.7 Ailments, Technicals, & Saving Throws.md`  | One ailment at a time (most recent takes priority); **duration via saving throw**: roll 1d20+Lu at end of each turn, succeed (>10) = cured; clear after combat; Downed exception: **Downed can coexist with another ailment simultaneously**, clears at start of very next turn; character with ailment cannot receive a Shift or participate in All-Out Attacks; individual ailment files transcluded; Technicals table; **Saving Throws** section (flavor text todo) |
| `1. Players/3. Combat/Ailments/Downed.md`                             | Downed: cannot move, take actions, or use reactions; clears at start of very next turn; **can coexist with another ailment simultaneously**                                                                                                                                                                                   |
| `1. Players/3. Combat/Ailments/Burn.md`                               | Burn: 10% max HP damage at end of each turn                                                                                                                                                                                                                                                                                   |
| `1. Players/3. Combat/Ailments/Freeze.md`                             | Freeze: cannot take any Actions; Slash/Pierce/Strike affinities become Neutral if they're not already Weak                                                                                                                                                                                                                    |
| `1. Players/3. Combat/Ailments/Shock.md`                              | Shock: cannot take any Actions (Standard, Move, or Reaction); when dealing or receiving Physical damage, roll 1d4 — on 4, **afflicted character is cured and the other combatant becomes Shocked instead**                                                                                                                    |
| `1. Players/3. Combat/Ailments/Dizzy.md`                              | Dizzy: −10 to Attack Rolls                                                                                                                                                                                                                                                                                                    |
| `1. Players/3. Combat/Ailments/Forget.md`                             | Forget: cannot use Skills that cost HP or SP                                                                                                                                                                                                                                                                                  |
| `1. Players/3. Combat/Ailments/Sleep.md`                              | Sleep: cannot take any Actions; recover 10% max HP at end of each turn; cured immediately upon taking damage                                                                                                                                                                                                                  |
| `1. Players/3. Combat/Ailments/Confuse.md`                            | Confuse: no Reactions; roll 1d4 at start of each turn (1 = attack a random ally, 2 = consume a random item, 3 = do nothing, 4 = act normally)                                                                                                                                                                                |
| `1. Players/3. Combat/Ailments/Fear.md`                               | Fear: must use Move Action each turn to move as far as possible from the source of Fear                                                                                                                                                                                                                                       |
| `1. Players/3. Combat/Ailments/Despair.md`                            | Despair: lose 5% max SP at end of each turn; if still afflicted at end of 3rd turn, drop to 0 HP                                                                                                                                                                                                                             |
| `1. Players/3. Combat/Ailments/Rage.md`                               | Rage: Attack increased, Defense and Hit/Evasion decreased; must use weapon to attack closest enemy each turn (Move to Engage as needed)                                                                                                                                                                                       |
| `1. Players/3. Combat/Ailments/Brainwash.md`                          | Brainwash: must act against allies and on the side of enemies (heal/support enemies, attack allies); alternatively, DM takes control of the character                                                                                                                                                                         |
| `1. Players/3. Combat/3.8 Battle Conditions.md`                       | Attack/Defense/Hit-Evasion stats (neutral/increased/decreased), stacking rules (duration extension instead), Charged and Concentrating conditions (2.5× next attack)                                                                                                                                                          |
| `1. Players/3. Combat/3.9 Death & Fallen Characters.md`               | Fallen (0 HP, recoverable), Dead (whole party Fallen or narrative death), non-lethal encounters                                                                                                                                                                                                                               |
| `1. Players/3. Combat/3.10 Spoils.md`                                 | Post-combat card draw triggered by All-Out Attack or Synthesis Skill; roll 1d4+1 and draw that many cards, party chooses 1; chosen card removed for rest of dungeon; 52 Minor Arcana (Coins/Wands/Swords/Cups) + DM-selected Major Arcana; Swords scale with party level; collecting all Major Arcana in one day = 1 Victory; Wands/Cups/Major Arcana entries still todo |

### 2. Dungeon Masters/

| File                                  | Contents                                                                                                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2. Dungeon Masters/Characters.md`    | Collaborators section substantially written: what they are, **full Arcana descriptions for I (Magician) through XIX (Sun)** with personality archetypes, typical roles, arc patterns, and shadow/best-case descriptions; Arcana comparison table (Fortune vs. Hanged Man); note on Fool/Judgement/World (excluded: Fool = PCs, Judgement = narrative moment, World = complete characters). Archetype and Rewards sections still todo. Villains still stub. |
| `2. Dungeon Masters/Dungeoneering.md` | Empty                                                                                                                                                                                          |
| `2. Dungeon Masters/Exploration.md`   | Substantial DM guidance: game designer mindset, highlighting interactables (2–4 rule), exploration loop, nesting/branching scenes, applying the loop to other pillars (downtime, social, loot) |

### Archetypes/

Actual Archetype stat blocks (Attribute bonuses, Affinities, Skill lists, Synthesis Skills).

### Skills/

Individual Skill definition files used for transclusion across the rulebook. Each file contains frontmatter (damage, cost, accuracy, ailment threshold) and a callout block with the formatted skill card.

### Archive/

`Archived Rows & Movement.md` — the old 3.5 Rows & Movement content, preserved for reference.
`Archived On Your Turn.md` — the old 3.3 On Your Turn content, preserved for reference.

### Root

| File            | Contents                                                                   |
| --------------- | -------------------------------------------------------------------------- |
| `Idea Board.md` | Design scratchpad: for user. Generally ignore content within as it is WIP. |
| `Tasks.md`      | Project task tracking: for user. Also generally ignore content within.     |
| `PRD.md`        | Character Sheet App PRD: web app for creating/maintaining characters. Not rules content — ignore for rulebook tasks. |

## Core Mechanics Summary

**Character Stats**
- **Attributes** (−7 to +7): Strength, Magic, Agility, Luck — set by active Archetype, not accumulated via leveling; hard cap at ±7 regardless of bonuses
- **Virtues** (Rank 0–7): Expression, Empathy, Wisdom, Focus — Rank 0 = below average, Rank 1 = average; social/exploration checks; advance via Sparks, not leveling
- **HP/SP**: Determined by path choice (Health-Focused / Balanced / Skill-Focused); rolled or averaged on level-up

**Leveling**
- Gain levels by accumulating 7 Victories (narrative milestones — standard combat does *not* award them)
- Victories come from meaningful story wins; Heroic Victories count as 2; overflow carries forward
- Each level: +HP/SP (1 Hit Die + 2 Skill Dice), +2 Archetype Ranks (no per-level Attribute points; Attributes come from Archetypes)
- **Maximum level: 30**

**Knives, Chains & Identity**
- **Knives**: external things a character cares about (~7 at creation); give the DM stakes and Victory hooks
- **Chains**: internal limitations; must all be broken to unlock the Paragon Archetype; can be gained through play
- **Identity**: Personality Traits, Hopes, Dreams, Fears, Secrets — character flavor traits built after Knives/Chains are settled

**Archetypes**
- Jobs/classes; multiple unlockable, one active at a time; switch at a Respite (not freely outside combat)
- Organized into Lineages; higher tiers require maxing the prior tier; DM gates Lineages and higher tiers behind narrative progression
- Provide Attributes (full score block, not bonuses), Affinities, and Inheritance Slots for cross-class Skills
- Mastering (Rank 5) grants a small **permanent** bonus to Attributes, HP, or SP — persists even when the Archetype is inactive, but hard cap still applies
- **Synthesis Skills** listed on Archetype pages; cannot be inherited
- **Paragon Tier** (4th tier): one per character, same Lineage as Origin; requires meeting Lineage prerequisites *and* breaking all Chains; cannot unlock the Paragon of a different Lineage
- Optional level-gate rules available for groups that don't want narrative advancement (Adept 8, Elite 16, Paragon 24)

**Combat Flow**
- No grid; battlefield divided into **Zones** (~30 ft each); characters are **Engaged** (locked in close combat with specific creatures) or **Free** (unattached, room to maneuver)
- **Ambush**: d20 + diff between sides' highest Agility scores; total 11+ = success; natural 20 = auto-success; natural 1 = counter-ambush; DM may grant Advantage/Disadvantage or rule ambush impossible; successful ambush = ambushing side takes all their turns before the other side acts, then normal order resumes
- **Turn Order**: side-based drafting; side with highest single Agility goes first every round (tiebreak: highest Luck; still tied: DM rolls d20, 11+ = players first); within each round, sides alternate picking one combatant to act; no combatant goes twice until all allies have acted; if one side exhausts its combatants first, remaining side finishes back-to-back; Fallen combatants skip turns until revived; new combatants joining mid-round act at the next round's start
- Each turn: one **Move** (Travel to adjacent Zone / Engage an enemy / Approach an object) + one **Standard Action** + one **Reaction**; Disengage is its own Action
- **Action economy**: Follow-Ups grant only a Standard Action (no Move, no Reaction); Reactions are restored only at the start of a normal turn
- **Opportunity Attacks**: Reaction triggered when an Engaged enemy moves without Disengaging, or when you use a Skill with a non-Engaged Range while Engaged (all Engaged enemies can take this)
- **Interception**: Free character can use their Reaction to stop an enemy leaving the Zone, becoming Engaged (no attack)
- Skill **Range** categories: Engaged / All Engaged / Same Zone / Same+Adjacent Zone / Adjacent Zone (or explicit distance)
- **AOE Skills**: capped (choose up to N targets in a Zone) or uncapped (all creatures in a Zone); **Casting Recklessly** raises the cap by a listed amount but catches allies in the blast
- **Attack Roll**: d20 + listed Attribute score → compared to thresholds printed on the Skill/weapon card; different ranges give different effects (miss, hit with varying damage, or side effects). Separate Accuracy/Crit rolls are gone — it's all one roll. **Natural 1 = always miss; natural 20 = always best result regardless of total**. Multi-attribute Skills always use the highest score.
- **Side effects** (Crits, Ailments): a high Attack Roll result triggers a *chance* at the side effect, which is then confirmed by comparing your Luck to the target's Luck (your Luck must be higher); *Auto-* prefix skips the comparison; natural 20 auto-applies all side effects
- **Critical Hits**: doubled damage + target is Downed. **Ailments**: inflicted if Luck check passes. **Insta-Kill**: target drops to 0 HP if Luck check passes; immune if their level ≥ caster's; becomes Auto-Insta-Kill if target is Weak to the type; no effect if target Resists/Nulls/Repels/Drains
- **Attack classes**: Physical (uses St or Ag for roll and damage), Magical (uses Ma), Healing, Ailment, Support
- **Affinities**: Neutral / Weak (1.5×, Downed) / Resist (0.5×) / Null / Repel (reflects) / Drain (heals); Almighty bypasses all; damage types include **Soul** (formerly Nuke → Aether) and **Mind** (formerly Psy)
- **Battle Conditions**: Attack, Defense, Hit/Evasion can be raised or lowered; Charged/Concentrating multiplies next attack by 2.5×
- **Follow-Ups**: Downing an enemy grants a bonus Standard Action (no Move, no Reaction); **Shift** passes it to an ailment-free ally; if attacker also becomes Downed on the same attack (e.g., natural 1 crit failure, or Repel blowback), no Follow-Up is granted
- **All-Out Attack**: when all enemies Downed; each ally rolls their weapon damage + higher of Str/Mag; combined total applied as Almighty damage to every enemy; ailment/Fallen characters excluded; no Follow-Up after
- **Synthesis Skills**: cooperative alternative to All-Out Attack; all participants must be **healthy (no Ailment, not Fallen)**; require Archetype lineage prerequisites; all participants pay SP and roll damage; combined total; only enemies that took damage lose Downed status

**Ailments**
- One at a time (most recent takes priority); end via **saving throw** (1d20 + Lu > 10 at end of each turn); clear after combat
- A character with an Ailment cannot receive a Shift or participate in an All-Out Attack
- **Downed**: cannot move, take actions, or use reactions; clears at start of very next turn; **can coexist with another ailment simultaneously**
- **Burn**: −10% max HP at end of each turn
- **Freeze**: no Actions; Slash/Pierce/Strike affinities become Neutral if not Weak
- **Shock**: no Actions (Standard, Move, or Reaction); Physical damage triggers 1d4 — on 4, afflicted character is cured and the other combatant becomes Shocked
- **Dizzy**: −10 to Attack Rolls
- **Forget**: cannot use Skills that cost HP or SP
- **Sleep**: no Actions; +10% max HP at end of each turn; cured by taking damage
- **Confuse**: no Reactions; roll 1d4 each turn (1=attack random ally, 2=consume random item, 3=do nothing, 4=act normally)
- **Fear**: must move as far as possible from source of Fear each turn
- **Despair**: −5% max SP each turn; if still afflicted at end of 3rd turn, HP drops to 0
- **Rage**: Attack up, Defense and Hit/Evasion down; must attack closest enemy each turn
- **Brainwash**: must act against allies; DM may take control of character
- **Technicals**: correct damage type on a specific ailment = 1.5× damage + Downed; full table in `3.7 Ailments, Technicals, & Saving Throws.md`

**Prisma**
- Every character carries a Prisma flask: 2 charges base, heals 2d8+4 HP per charge, Standard Action to use
- Can administer a charge to an ally in the same Zone (Standard Action; DM may require a Move to reach); Fallen characters are not revived unless the flask has been upgraded for that
- Refills at Full Rest (requires being near Prisma facilities, available in nearly every settlement)
- 5-color upgrade tree (paid for in gold, each upgrade costs more than the last):
  - **Red**: increased HP restoration per charge
  - **Yellow**: additional charges
  - **Green**: cures or wards against Ailments
  - **Blue**: grants a Battle Condition buff alongside healing
  - **Purple**: restores SP in addition to HP
- Specific upgrade entries are still todo

**Spoils**
- After a combat that ends with an All-Out Attack or Synthesis Skill, one player rolls 1d4+1 and draws that many cards from the Spoils Deck (recommended: the player who initiated the finishing move)
- Party collectively chooses 1 card to take effect (rolling player has final say on stalemates); for single-target cards, the party also chooses who benefits
- Chosen card is removed from the deck for the rest of the dungeon; unchosen cards are shuffled back
- **Minor Arcana** (52 cards, 4 suits): Coins (gold, 1d10–16d10 gp by rank), Wands (exploration boons), Swords (single-use Skill Cards), Cups (HP recovery or combat buffs)
  - Swords scale by party level: base tier → Medium at level 8 → Heavy at level 16 → Severe at level 24
- **Major Arcana**: DM selects which of 21 possible cards to include when party enters dungeon; count = (avg party level ÷ 2, rounded down) + 1; collecting all Major Arcana in a single adventuring day awards 1 Victory
- All Wands, Cups, and Major Arcana card effects are still todo

**Resting & Exhaustion**
- **Full Rest** (8 hrs, safe location): recover all HP and SP, restore all spent dice, reduce Exhaustion by 1
- **Partial Rest** (6–8 hrs, temporary shelter): recover all HP, roll Skill Dice for SP recovery
- **Respite** (20 min / 2 dungeon turns): roll Hit Dice for HP only; no SP recovery
- Exhaustion accrues after 48 dungeon turns (8 hrs); 1 level per 3 additional turns; Exhaustion table not yet written

**Time**
- Standard day has two activity **slots** (morning and evening)
- Three activity categories: **Virtue** (advance Sparks), **Collaborator** (social bonds), **Practical** (recovery, crafting, etc.)
- **Dungeon Turns**: 10-minute increments; Respite costs 2 turns; party is limited to ~48 turns before Exhaustion

**Talent Tests (formerly D20 Tests)**
- Roll d20 + Attribute score (for physical/combat-adjacent challenges) OR d20 + Virtue Rank (for social/knowledge challenges) vs. DC
- If a **Talent** applies (from Archetype, Background, or downtime), add +3; only one Talent bonus per Test
- No fixed pairing between Talents and stats — DM and player negotiate based on approach
- No auto-fail/succeed on natural 1/20
- **Virtue Gates**: minimum Virtue Rank required for sustained capability (not luck-based); separate from Talent Tests but can layer on top
- Talents can be learned via 5 downtime activity slots; DM may require an NPC teacher, tome, or equipment

**Virtue Advancement (Sparks)**
- Virtues range Rank 0–7; new character starts at all Rank 0, then +2 to one Virtue and +1 to two others at creation
- Accumulate 7 Sparks → rank up one eligible Virtue; Sparks reset to zero
- Sparks from downtime activities (each tied to a Virtue); DM may also award a Spark when a character **demonstrates a Virtue meaningfully in play** (e.g., a great argument in Negotiation earns an Expression Spark)
- Must have participated in at least one activity tied to a Virtue since last rank-up to be eligible
- Activities system not yet written up

**Negotiation**
- High-stakes structured social encounters with Interest (1–6) and Patience (1–6) tracks
- NPC has Motivations (raise Interest when appealed to) and Pitfalls (auto-fail + penalties)
- Players make Expression Tests; result determines Interest/Patience changes
- **Shared Language**: if 1 party member shares a non-standard language with the NPC, Patience starts +1; if 3+, Patience starts +2 (cap 6)
- **Lying**: if a failing argument was a lie, DM may rule the NPC catches it — Interest −1 on top of the failure penalty
- **Continuing or Walking Away**: players can keep negotiating as long as Patience > 1 and Interest is 2–5, or accept the current offer and end; players may end the Negotiation at any time
- Negotiation ends when Interest hits 1 or 6, Patience hits 1, or players walk away; final offer determined by Interest level

## Incomplete / TODO Areas

- Spoils deck card effects — Wands (exploration boons), Cups (HP/buff effects), and all 21 Major Arcana entries are still empty in `3.10 Spoils.md`
- Prisma upgrade tree — 5 colors defined, individual upgrade entries still todo in `2.6 Prisma & Prismatic Upgrades.md`
- Exhaustion table — mechanics designed (1 level per 3 turns past 48), table not yet written
- `1. Players/2. Playing the Game/2.4 Exploration.md` — partially written (hex travel basics); full player-facing exploration rules not yet done
- `Dungeon Masters/Dungeoneering.md` — empty
- `Dungeon Masters/Characters.md` — Collaborators Arcana descriptions written (I–XIX); Collaborators Archetype and Rewards sections still todo; Villains still stub
- `1. Players/1. Character Building/1.2 Attributes and Virtues.md` — Higher Level Characters section is a todo
- `1. Players/3. Combat/3.7 Ailments, Technicals, & Saving Throws.md` — Saving Throws flavor text still todo
- Archetype stat blocks — Warrior, Knight, Thief, Mage, Healer lineage files exist under `Archetypes/`; completeness unknown
- Downtime activities system — designed but not written up; activity categories exist (Virtue/Collaborator/Practical) but individual activities not listed
- Ancestry and Background rules — deferred to campaign setting

## Design Notes

- Tone is Persona 5 (Joker, Panther, Skull, Mona used as examples throughout)
- Fallen ≠ Dead: Fallen is a recoverable in-combat game state; Death is a narrative device
- Optional rules: Critical Failures on natural 1 (Talent Tests), Advantage/Disadvantage on ambush rolls (DM-granted)
- DM gates higher-tier Archetypes behind narrative progression; level-gate alternative provided for non-narrative campaigns
- Zones replaced Rows as the spatial system; old Rows content preserved in `Archive/Archived Rows & Movement.md`
- Old 3.3 On Your Turn content preserved in `Archive/Archived On Your Turn.md` (replaced by a full rewrite)
- Dungeons are intended to be composed of Zones; dungeon turns represent ~10 minutes to fully search a Zone (from Idea Board — not yet written up)
- **Downed** is full incapacitation (no move, no action, no reaction); clears at start of very next turn; **can coexist with another ailment simultaneously** (previous rule was "cannot be overwritten" — this is the corrected version)
- **Nuke** damage type renamed to **Aether**, then to **Soul**, throughout; **Psy** damage type renamed to **Mind** (one syllable, and avoids confusion with the **Psi** Skill)
- **Attributes** redesigned from 1–30 scale (with level-up point allocation) to −7 to +7 scale (set entirely by active Archetype). Endurance removed as an Attribute — it no longer appears in combat math as a damage-reduction stat for normal attacks.
- **"Extra Turns"** renamed to **"Follow-Ups"** throughout; file 3.6 renamed accordingly
- **"D20 Tests"** renamed to **"Talent Tests"**; new Talent system added (proficiencies giving +3 bonus); roll formula changed to d20 + raw Attribute score or Virtue Rank (no division or modifier table)
- Skill damage scale (Weak/Medium/Heavy/Severe/Colossal) and SP cost table exist in Idea Board but not yet formalized in the rulebook
- Ailment duration redesigned from "lasts until start of the 3rd turn" to saving throw (1d20 + Lu > 10 at end of each turn cures it); this changes how long ailments last on average — it is no longer a fixed countdown
