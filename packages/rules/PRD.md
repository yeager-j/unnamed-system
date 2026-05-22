# Unnamed System — Character Sheet App

A web app for creating and maintaining characters in the Unnamed System TTRPG. This document describes the MVP product. Tech stack is deferred to implementation.

## 1. Summary

Players sign in with Google, build characters through a guided flow that enforces the rules of the Unnamed System, and return to a living character sheet that updates as they play. Sheets are public by URL so players can share them with their DM or table. There is no DM role at MVP; the DM is offline.

## 2. Goals and Non-Goals

**Goals**

- Walk a new player through Level 1 character creation without them needing to know the rulebook.
- Provide a clean, readable character sheet that's pleasant to use at the table on any device.
- Update HP, SP, and other in-session state directly from the sheet — including "casting" a Skill, which deducts its cost.
- Track persistent character growth (Victories, Sparks, level-ups, Archetype Ranks, Chains/Knives notes) so the sheet evolves with play.
- Treat every sheet as a shareable artifact via public URL.

**Non-Goals (MVP)**

- DM tooling, campaign management, or per-campaign content (Ancestry/Background lists, Lineage gating, Victory awards).
- Dice rolling for attacks or Talent Tests.
- Multi-character or multi-user real-time play features (initiative trackers, group HP, shared notes).
- Mobile native apps.
- Importing rules from the Obsidian vault — game data is hardcoded.
- Enforcement of Archetype advancement gates (narrative or level-gate). Both are tracked descriptively, not blocked mechanically.

## 3. Users and Authentication

**Roles.** Single role: Player. Anyone can sign up; anyone can create characters.

**Auth.** Google OAuth only. No email/password fallback.

**Account.** A user has a display name (sourced from Google), avatar, and zero or more characters. Users may create unlimited characters.

**Public sharing.** Every character sheet has a public read-only URL. Anyone with the URL can view, but only the owner can edit. No privacy toggle at MVP.

## 4. Information Architecture

The app has four top-level surfaces:

- **Home / My Characters** — list of the signed-in user's characters with a "Create new character" button. Each row links to the sheet.
- **Character Builder** — multi-step flow for creating a new Level 1 character. Step indicator at top.
- **Character Sheet (edit)** — the owner's editable view: a persistent header plus four play-context tabs (Combat / Explore / Inventory / Archetypes). See §6.1.
- **Character Sheet (public)** — the same header + tabs, read-only, at a stable URL like `/c/{shortId}`. The active tab is URL-addressable (`?tab=`) so a specific view is shareable.

Signed-out users can view public sheets but get a "Sign in to create your own" CTA.

## 5. Character Builder

A linear, savable flow. The player can back up to a previous step at any time; partial drafts are persisted automatically. Order mirrors the rulebook (Chapter 1).

### 5.1 Steps

1. **Name & Pronouns.** Character name, pronouns (free text), optional portrait/avatar upload.
2. **HP/SP Path.** Choose one: Health-Focused (d12/d8), Balanced (d10/d10), or Skill-Focused (d8/d12). Show resulting starting HP/SP (24/40, 20/50, 16/60).
3. **Origin Archetype.** Pick one Archetype as the character's Origin. The app should not gate Archetypes at MVP — present all of them, grouped by Lineage. Show each Archetype's stat block (Attribute scores, Affinities, Skills at Ranks 1–5, Synthesis Skill, Talents, Mastery bonus). Selecting an Origin auto-sets Archetype Rank to 2 and unlocks Skills at Ranks 1 and 2.
4. **Virtue Allocation.** All four Virtues (Expression, Empathy, Wisdom, Focus) start at Rank 0. Player assigns +2 to one Virtue and +1 to two others. Enforce: exactly one +2 pick, exactly two +1 picks (all to different Virtues).
5. **Ancestry & Background (free text).** Two long-text fields with brief in-context guidance from the rules. Player types whatever their DM has provided. Bonuses, Talents, or features granted by these are added by the player in the relevant section, not parsed from the text.
6. **Backstory.** Long-text field. Brief in-context guidance: "Tell us who your character was before the adventure begins."
7. **Knives.** Repeating list of short entries (title + optional description). Suggest ~7 Knives; warn at <4 or >12 but allow it.
8. **Chains.** Repeating list of short entries (title + optional description). At least one Chain.
9. **Identity Traits.** Five sub-fields, presented after Knives/Chains so the player has material to draw from:
   - Personality Traits (2–4 short entries)
   - Hopes (1–2 entries)
   - Dreams (1 entry)
   - Fears (1–2 entries)
   - Secrets (1–2 entries)
   
   The "minimum/maximum" counts are advisory, not enforced.
10. **Talents.** Pre-filled with the Talents granted by the Origin Archetype. Player can add more from the canonical Talent list (Alchemy, Cook, Enchant, etc.) or type a custom Talent name (e.g., one granted by their Background).
11. **Equipment.** Browse the weapon catalog to add items to inventory and optionally equip a starting weapon. Inventory has no size limit; only one weapon may be equipped at a time. The armor and accessory catalogs are empty at MVP, so those slots remain unequipped at creation.
12. **Review & Confirm.** Read-only summary of all choices. "Create character" finalizes and routes to the sheet.

### 5.2 Rules the Builder Enforces

- Attributes are determined entirely by the Origin Archetype — not entered by the player.
- Virtue allocation rules (5.4) are validated before allowing the player to leave that step.
- HP/SP path determines starting HP/SP and Hit/Skill Die for future leveling.
- Origin Archetype determines which Paragon Archetype is eventually available (informational only at MVP, since gating isn't enforced).
- Required: name, HP/SP path, Origin, Virtue allocation. Everything else is optional but encouraged with non-blocking guidance.

## 6. Character Sheet (Living)

The sheet is the primary surface a player returns to. It supports both reading and editing. The owner sees inline edit affordances; the public view shows the same content read-only.

### 6.1 Layout

A **persistent header** (always visible) above **four play-context tabs**: Combat · Explore · Inventory · Archetypes. Default tab is Combat; the active tab is URL-addressable (`/c/{shortId}?tab=…`) so a specific view is shareable. The tab strip is responsive — icon + label, collapsing to icon-only on narrow screens.

#### Header (persistent, above the tabs)

Portrait, name, pronouns, `Level N · Archetype · Victories x/7`, currency, current HP/SP (with bars), and **Attributes** (Strength/Magic/Agility/Luck). These are the at-a-glance, context-independent facts: identity, can-I-act (HP/SP), my numbers (Attributes), my progress (Level/Victories). Victories is shown read-only here — progress toward the next level (§7.4). Attributes show the active Archetype's value plus permanent bonuses (Mastery, equipment), hard-capped at ±7. Hit/Skill Dice and the Prisma charge count are intentionally *not* here — Dice are rest-time bookkeeping (§7.3) and Prisma is a consumable (§7.6).

In **owner edit mode** the header gains one compact actions affordance ("Owner controls" — not an always-expanded toolbar): Take damage, Heal, Spend SP, Use Prisma, Rest (→ dialog), and Victories ± / Level-up (CTA at Victories ≥ 7 → dialog). Multi-step flows (Rest, Level-up) open in a dialog; Hit/Skill Dice surface inside those dialogs. The public/read-only sheet shows none of these controls.

#### Combat tab

- **Affinities.** Visual chart of all 11 damage types showing Neutral / Weak / Resist / Null / Repel / Drain. Computed: active Archetype's chart, overridden by equipment, then by any inherited or active Skills that change Affinities.
- **Skills.** Combined list of the character's currently available Skills (active Archetype's unlocked Ranks + that Archetype's Inheritance Slots + active passives from equipment). Each shows name, cost (concrete numbers — see 7.2), and a one-line description; a popover reveals the full Skill card (range, damage formula, Attack Roll thresholds, side effects). Each has a **Cast** button (7.2). The equipped weapon's intrinsic attack appears alongside this list in a dedicated **Weapon Attack** card so combat reference stays in one place; equip state itself lives on the Inventory tab (§6.1 Inventory tab, §6.2).
- **Synthesis Skills.** Subsection beneath Skills. Lists the active Archetype's Synthesis Skill (if unlocked at the current Rank). Cast deducts only this character's share; coordinating with the party is out-of-band at MVP (7.2).
- **Combat State.** Current Ailment (if any), Battle Conditions (Attack/Defense/Hit-Eva — neutral/increased/decreased, with stack count if extended), Charged / Concentrating toggles, current Exhaustion (0+). A "Clear combat state" button wipes all of it after combat.

#### Explore tab

- **Virtues.** Expression, Empathy, Wisdom, Focus, each with current Rank. Beneath: the shared Spark progress — "Sparks: 4/7" plus a breakdown of which Virtues are represented (e.g., "Wisdom ×2, Empathy ×1, Focus ×1"). A "+1 Spark" control opens a Virtue picker; at 7 Sparks a "Rank up" CTA appears, offering only the Virtues present in the log; on rank-up the log clears. (Spark display is read-only on the public sheet; the controls are owner-mode.)
- **Talents.** The character's known Talents. Add/remove; auto-include the active Archetype's Talents plus any explicitly added. Talents serve both social and exploration play — hence this tab's name ("Explore" encompasses social).
- **Identity.** Knives, Chains, Personality Traits, Hopes, Dreams, Fears, Secrets — editable lists/text. Knives and Chains are descriptive only at MVP.
- **Notes.** A free-text notes field for the player.

#### Inventory tab

Possessions and equip state, in one place. From the top:

- **Equipped.** Three slot blocks (Weapon, Armor, Accessory) with the equipped item's name, brief description, and effects (Attribute bonuses, Affinity changes, granted Skills) so the player can see why their stats look the way they do. An unfilled slot shows an "Empty slot" placeholder. The equipped weapon's **intrinsic attack** is *not* duplicated here — it lives in the Combat tab's Weapon Attack card.
- **Inventory.** Every owned item, grouped by slot type (Weapons / Armor / Accessories). Each row shows the item name and brief description; the full effects are revealed in a popover on click (desktop) or tap (mobile). Currency rides right-aligned in this section's header (also shown in the persistent sheet header) so a deep-linked `?tab=inventory` view stays self-contained. Equip/unequip and add/spend currency (§7.7) live here in owner mode (display-only on the public sheet).

Items can confer Affinity changes, Attribute bonuses, or Skills — see 6.2.

#### Archetypes tab

- **Active Archetype** card with its full block: Attributes, Affinities, Skills at the current Rank, Synthesis Skill (if unlocked), Inheritance Slots.
- "Switch Active Archetype" → picker of unlocked Archetypes; switching shows the reminder "You may only switch Archetypes during a Respite."
- **Unlocked Archetypes** list: each with current Rank (1–5), Skills unlocked, Inheritance Slot config, a "Rank up" affordance that spends a saved Archetype Rank; Mastery (Rank 5) shows the permanent bonus.
- **Saved Archetype Ranks** counter (gained from leveling, unspent).
- **Unlock new Archetype** → the Archetype catalog. No prerequisites enforced, but display them informationally ("Requires Mage 5").

There is no separate Progression or Vitals section: HP/SP and Victories live in the persistent header; the level-up walkthrough (§7.4) and Rest (§7.3) are owner-mode dialogs launched from the header.

#### 6.2 Equipment Effects

A character has exactly three equipment slots: Weapon, Armor, Accessory. The inventory can hold any number of items; only one item per slot type may be equipped at a time. Each catalog item is baked to a single slot type — a weapon can't be equipped as armor, etc.

Items are hardcoded catalog entries defined in game data, alongside Skills. The player browses the catalog when adding items to their inventory; custom user-defined items are out of scope for MVP.

Equipped items can grant any combination of:

- **Attribute bonuses.** Add or subtract from HP, SP, Strength, Magic, Agility, or Luck. Hard cap of ±7 still applies.
- **Affinity changes.** Override the active Archetype's Affinity for one or more damage types.
- **Granted Skills.** Add a Skill to the character's Skill list while equipped.

**Weapons additionally have an intrinsic attack** — Range, Damage type, and Attack Roll thresholds, structured like a Skill. The weapon's attack appears alongside the character's Skill list while the weapon is equipped, but is not counted as a "granted Skill" effect (it's intrinsic to the weapon, not an effect on top). Example:

> **Longsword.** Range: Engaged. Damage: Slash (Physical).
> Attack Roll + Strength:
> `1–10` → `1 + St`
> `11–19` → `1d6 + St`
> `20+` → `1d6 + St`, *Critical*

At MVP, only the weapon catalog has content. The armor and accessory catalogs are structurally defined but empty — those slots can only be equipped once content is added in a later release.

## 7. Mechanics the App Must Understand

The app does not roll dice or compute damage, but it must understand a handful of mechanics well enough to update state correctly.

### 7.1 Stat Computation

A character's displayed Attributes are: `active Archetype's Attribute score` + `permanent bonuses from any Mastered Archetype` + `equipped item bonuses`. Clamp to ±7.

**Mastery is automatic.** Each Archetype has exactly one specific Mastery bonus baked into its game data (Warrior: +20 HP, Mage: +20 SP, etc.). When a character reaches Rank 5 in an Archetype, the bonus is automatically applied to the sheet — the player makes no choice. Bonuses persist even when the Archetype is inactive, but the ±7 Attribute cap and max-HP/SP totals always reflect them.

A character's displayed Affinity chart is: `active Archetype's chart`, then overridden by equipment, then overridden by any Skill in the active Archetype's slot list that changes Affinities (e.g., Null Pierce). Priority is as follows: Drain, Repel, Null, Resist, Normal, Weak. If an equipment grants Null Pierce but a Skill grants Resist Pierce, Null Pierce is displayed.

Max HP is `path's starting HP + sum of Hit Dice rolled or averaged on level-up + any permanent HP bonuses`. For MVP, only take the average; don't allow rolled Hit Dice. Max SP is computed analogously.

### 7.2 Casting a Skill

Each Skill's cost is defined in game data as either a flat SP amount (e.g., `4 SP`) or a percentage of max HP (e.g., `10% HP`). The app resolves percentage costs against the character's current max HP (rounded down to integer) at display time, so the cost shown on the sheet is always a concrete number ("`16 HP`" for a 10% Skill on a 160-HP character).

App checks the Skill's resolved cost. If the character can't pay (current SP < cost, or current HP ≤ cost; a player can't drop to 0 HP by using a Skill), disable Cast button. When the player presses Cast on a Skill:

1. Deduct the resolved cost from the appropriate pool.
2. The app does not roll damage, apply effects to a target, or change Affinity charts as a result.

**Synthesis Skills.** Listed in their own subsection on the sheet (see 6.1). At MVP, casting a Synthesis Skill only deducts this character's share of the cost; other participants manually deduct their own. A future Campaign system will coordinate deductions across all participating characters automatically.

### 7.3 Resting

Three rest buttons on the sheet:

- **Full Rest.** Restore HP and SP to max. Restore all spent Hit/Skill Dice. Reduce Exhaustion by 1.
- **Partial Rest.** Restore HP to max. Prompt the player to spend Skill Dice for SP recovery (the app lets them choose how many; it doesn't roll, but does deduct the dice and add the chosen result).
- **Respite.** Prompt the player to spend Hit Dice for HP recovery (same model — choose count, player rolls manually). No SP recovery.

### 7.4 Leveling Up

When Victories ≥ 7:

1. CTA on the sheet: "Level up."
2. Walk the player through gaining 1 Hit Die + 2 Skill Dice (choose roll or average; the app accepts a roll result from the player). Add to max HP and max SP.
3. Grant 2 Archetype Ranks. Player can spend them now (rank up one Archetype twice, or two different Archetypes once each) or save them. Saved Ranks accumulate.
4. Decrement Victories by 7. Any overflow (e.g., earned an 8th Victory before leveling) carries forward.

Max character level is 30.

Victories are displayed read-only in the persistent header (`Victories x/7`; §6.1). The "Level up" CTA and the walkthrough above are owner-mode controls launched from the header as a dialog, not a body section.

### 7.5 Sparks & Virtue Rank-Up

A character has a single Spark log that holds 0–7 Sparks. Each Spark in the log is tagged with the Virtue that produced it (e.g., a Spark from a Wisdom downtime activity is tagged Wisdom). The sheet displays the count ("Sparks: 4/7") and a breakdown of which Virtues are represented in the current log.

The owner grants a Spark via a "+1 Spark" control that prompts for the Virtue tag. When the log reaches 7 Sparks, the sheet surfaces a "Rank up" CTA. The eligible Virtues for rank-up are exactly those that appear at least once in the current Spark log. On rank-up, the player picks one eligible Virtue, its Rank increases by 1, and the Spark log clears entirely.

This matches the rulebook's example in 1.2 — a character who earned Sparks of Wisdom (×4), Empathy (×2), and Focus (×1) reaches 7 Sparks and may rank up Wisdom, Empathy, or Focus, but not Expression.

### 7.6 Prisma

Track current charges and max charges (default max 2). "Use Prisma" button: decrement charges by 1. Player will roll and adjust their HP manually for the MVP. Refills to max on Full Rest. Prisma upgrades are out of scope for MVP (the rules themselves have these as TODOs). "Use Prisma" is an owner-mode action in the header's "Owner controls" actions affordance, shown as "Use Prisma (n)"; there is no persistent Prisma charge readout in the at-a-glance header — Prisma is a consumable, not a summary statistic.

### 7.7 Currency

A single currency field (gold pieces) on the sheet header. Add/spend buttons. No multi-currency support at MVP.

### 7.8 Inheritance Slots

Each unlocked Archetype has its own slot configuration. Slot count is defined by the Archetype (initiate tier = 2 slots; values for higher tiers come from the Archetype files). Slot content is one Skill, picked from any other unlocked Archetype's available Skills at the character's current Rank in that source Archetype. Synthesis Skills cannot be inherited.

Switching active Archetype changes which slot configuration is in effect. Each Archetype's slots persist independently.

## 8. Data Model (Sketch)

A non-exhaustive list of the entities the app needs. Field types are illustrative.

- **User.** `id`, `googleId`, `email`, `displayName`, `avatarUrl`, `createdAt`.
- **Character.** `id`, `shortId` (for public URL), `ownerId`, `name`, `pronouns`, `portraitUrl`, `level`, `pathChoice`, `currentHP`, `maxHP`, `currentSP`, `maxSP`, `hitDiceRemaining`, `skillDiceRemaining`, `permanentBonuses` (HP, SP, per-Attribute), `virtueRanks` (4 ints), `sparkLog` (array of Virtue tags, length 0–7), `victories`, `currency`, `prismaCharges`, `prismaMaxCharges`, `exhaustion`, `currentAilment`, `battleConditions` (struct), `activeArchetypeId`, `savedArchetypeRanks`, `ancestryText`, `backgroundText`, `backstoryText`, `personalityTraits` (string[]), `hopes` (string[]), `dreams` (string), `fears` (string[]), `secrets` (string[]), `notes`, `createdAt`, `updatedAt`.
- **CharacterArchetype** (join). `characterId`, `archetypeKey`, `rank`, `inheritanceSlots` ({slotIndex, sourceCharacterArchetypeId, skillKey}[]), `masteryBonusApplied` (bool).
- **CharacterKnife.** `id`, `characterId`, `title`, `description`, `order`.
- **CharacterChain.** `id`, `characterId`, `title`, `description`, `order`.
- **CharacterTalent.** `id`, `characterId`, `name` (canonical or custom).
- **InventoryItem.** `id`, `characterId`, `catalogItemKey` (references a Weapon/Armor/Accessory in game data), `equipped` (bool). The item's `name`, `description`, slot type, intrinsic attack (weapons only), and effects come from the catalog entry, not from the database row.

Game data (Archetypes, Skills, Talents) is hardcoded as static data the app references by key.

## 9. Game Data (Hardcoded)

The app ships with the canonical Unnamed System rules data transcribed from this vault. The MVP scope of game data:

- **Archetypes.** Four Archetypes at MVP: **Warrior, Knight, Mage, Healer**. (Thief and higher-tier Archetypes are deferred until their rules data is complete.) Each Archetype includes: Lineage, Tier, prerequisites (display-only), Inheritance Slot count, Talents granted, Mastery bonus, Attribute scores, Affinity chart, Skills by Rank (1–5), Synthesis Skill (Rank 5).
- **Skills.** Every Skill referenced by the four MVP Archetypes. Each Skill includes: name, type (damage type or category), cost (either a flat SP value or an HP percentage), range, one-line description, full card text (for the popover), and structured side-effect info if simple enough.
- **Weapons.** A starter catalog of weapons. Each Weapon includes: name, description, slot (always `weapon`), intrinsic attack (Range, Damage type, Attack Roll attribute, and result thresholds — structured like a Skill), and optional effects (Attribute bonuses, Affinity changes, granted Skill keys).
- **Armor & Accessories.** Type definitions exist parallel to Weapons but without an intrinsic attack — only optional effects. The MVP catalog for both is empty; content is added post-MVP.
- **Talents.** The canonical Talent list from rules 2.1.
- **Affinity types.** The 11 damage types (Slash, Pierce, Strike, Fire, Ice, Wind, Elec, Aether, Psy, Light, Dark) plus Almighty.
- **Ailments.** The 13 ailments from the rulebook (Downed plus the 12 listed in CLAUDE.md).
- **Battle Conditions.** The Attack/Defense/Hit-Eva model plus Charged/Concentrating.

Game data updates require a redeploy at MVP. A future admin interface or vault importer is out of scope.

## 10. Public Sharing

Every character has a stable public URL: `/c/{shortId}` where `shortId` is a short URL-safe slug (e.g., 8 characters). The public view shows the same sheet content as the owner view but with all edit controls hidden.

The sheet's URL is shown on the owner's sheet with a Copy button.

## 11. UX Notes

- **Responsive equally.** Both desktop and mobile are first-class. Desktop uses a sidebar + main pane; mobile uses tabs. Hover popovers on desktop become tap-to-open popovers on mobile.
- **Tone.** Match the rulebook: clear, prose-leaning, minimally formatted. Avoid table-heavy layouts where a clean inline summary works.
- **In-context guidance.** Each builder step includes a short blurb explaining what the player is choosing and why. Link to the relevant rulebook concept when helpful (but don't require the player to read it).
- **No dice.** Anywhere the rules call for a roll the player makes (Hit Die on rest, level-up HP gain, Prisma healing), the app accepts a numeric input from the player. The app never rolls on its own behalf.

## 12. Non-Functional Requirements

- **Latency.** Sheet edits should feel instantaneous — optimistic updates with eventual sync are acceptable.
- **Auto-save.** All edits persist automatically; no save button.
- **Auth security.** Standard OAuth flow; no PII beyond what Google returns.
- **Browser support.** Latest two versions of Chrome, Safari, Firefox, Edge.
- **Accessibility.** Reasonable defaults: keyboard navigation through the builder, semantic HTML, sufficient color contrast on the Affinity chart.

## 13. Tech Stack

- **Framework.** Next.js (App Router) with React Server Components and Server Actions. TypeScript throughout.
- **UI layer.** Tailwind CSS with shadcn/ui as the component primitives. Lucide for icons (already a shadcn dependency).
- **Forms & validation.** `react-hook-form` for form state and `zod` for schema validation. shadcn's Form components are built around this pairing, so the integration is essentially free. The same Zod schemas validate Server Action inputs on the server.
- **Auth.** Auth.js v5 (the rebranded NextAuth) with the Google provider only. Sessions in the database via the Auth.js Drizzle adapter so signed-in state survives across edge functions. Better Auth is a viable newer alternative if you want plugin-style features down the road, but Auth.js v5 is the lower-risk pick for a single-provider MVP.
- **Database.** Neon Postgres. Serverless, scales to zero, plays well with Vercel, and the `@neondatabase/serverless` driver works inside edge functions if needed.
- **ORM.** Drizzle. Smaller bundle than Prisma, no separate query engine to manage, schema-as-TypeScript that composes cleanly with Zod (via `drizzle-zod`). Migrations via `drizzle-kit`.
- **Image storage.** Vercel Blob for character portrait uploads. Configured with size limits and image-only mime types.
- **Short IDs for public URLs.** `nanoid` with a URL-safe alphabet, 8 characters. Reserved keywords and a uniqueness check on insert.
- **Hosting.** Vercel for the app, Neon for the database, Vercel Blob for files. Single-vendor for the runtime, two for stateful pieces.
- **Observability.** Vercel Analytics for basic metrics. Sentry recommended for error tracking, can be added post-MVP.
- **Testing.** Vitest for unit tests covering the game-mechanics logic (stat computation, leveling math, cost resolution). Playwright for a small E2E suite covering the builder flow and the cast/heal/rest loop. Tests aren't an MVP blocker but the mechanics module is exactly the kind of thing that benefits from unit coverage.

The game data (Archetypes, Skills, Talents, Ailments) lives in TypeScript files in the repo, not in the database. That keeps the canonical rules version-controlled alongside the code and avoids needing an admin interface to ship the MVP.

## 14. Out of Scope (MVP)

- DM features and campaigns.
- Dice rolling.
- PDF / print export. (The public URL is the share mechanism.)
- Real-time multiplayer features.
- Importing rules data from the Obsidian vault.
- Enforcing Archetype Lineage prerequisites or tier gates.
- Negotiation and downtime-activity helpers.
- Spoils deck simulation.
- Prisma upgrade tree (defined in rules but TODO).
- Multi-currency.
- Armor and accessory content (types exist; only the weapon catalog has entries at MVP).
- Custom user-defined items.

## 15. Post-MVP

Items deferred from MVP but worth designing toward:

- **Campaign system.** Group characters into a campaign. Synthesis Skills cast by one player automatically deduct cost from all participating characters in the campaign. Foundation for a future DM role and shared session state.
- **Higher-level character creation.** A "start at Level X" entry point in the builder that allocates Hit/Skill Dice and Archetype Ranks for levels 2 through X up front, rather than requiring the player to manually level up after creation.
- **Additional Archetypes.** Thief and any higher-tier Archetypes (Adept, Elite, Paragon) once their stat blocks and Skills are complete in the rulebook.
- **Setting-defined Ancestry and Background.** Replace the free-text Ancestry/Background fields with structured entries that grant mechanical effects (Attribute/Virtue bonuses, Talents, equipment).
- **Ailment duration tracking.** Count down the 3-turn duration on the sheet rather than leaving it to the DM and players.
- **Prisma upgrade tree.** Once the five upgrade trees (Red/Yellow/Green/Blue/Purple) are formalized in the rules, expose them on the sheet.
- **Print / PDF export.** A printable summary view for table use.
- **Armor and accessory catalogs.** Populate the catalog content for the two slot types that ship structurally defined but empty at MVP. Expand the weapon catalog as well.
- **Custom items.** Optional hybrid model: user-defined items alongside the curated catalog.
