# Embeds mini-design — `![[kind:id|label]]` block previews (UNN-624, P5)

Companion to `atomic-editor-technical-design.md` §6.3. Decisions grilled and
accepted 2026-07-14; this doc is the record the ticket's first AC gates on.

## Grammar & kind extension

The embed token is `!` + the chip grammar: `EMBED_TOKEN_SOURCE = "!" +
CHIP_TOKEN_SOURCE`, one tokenizer family in `domain/planner/chip.ts` serving
chips and embeds. The token is inert literal text in CommonMark — `![[…]]`
never parses as an Image node (no `(url)`), so storage purity and graceful
degradation (`|label` fallback) hold by construction on every surface without
embed support.

**`encounter` and `dungeon` become full participant kinds** (decision 1). Bare
`[[encounter:…]]` is a live inline chip everywhere — linker suggestions, hover
previews, mention index — and `!` purely selects block rendering: Obsidian's
link/embed split exactly. The alternative (embed-only kinds) would fork the
grammar into two kind-sets that every consumer re-decides — the §9 "decide a
distinction once" smell. The old round-trip pin that `[[dungeon:d1|…]]` stays
plain text flips deliberately; the new pin is a live chip + embed expectation.

Ref identity (decision 2): **ref id = the durable UUID**, matching every other
kind; the URL `shortId` travels as one shared optional `shortId` field on
`LinkerOption` / `ParticipantLinkTarget` / `ParticipantPreview`, replacing the
kind-named `characterShortId` (character rows migrate in the same change).

Tombstones: encounters/dungeons have no `deletedAt` — they hard-delete. A
deleted target is a resolver **miss** (muted, captured-label fallback), never a
tombstone; `validateParticipantRefs`' tombstone rejection is vacuous for these
kinds.

## Which kinds embed (decision 3)

v1 block cards exist for `encounter` and `dungeon` only, behind a **per-kind
card-builder map** (the registry pattern) — an npc/article card is a later map
entry, not a redesign. An embed of an unsupported kind degrades by
construction to a literal `!` followed by the normal inline pill; no special
code path.

## Card data (decision 4)

One preview seam. `loadParticipantPreview` gains encounter/dungeon arms;
`ParticipantPreview` gains `shortId: string | null` plus typed card-line
fields (status line, participant/turn count). The editor's DOM card and the
display card both read the existing cached `fetchParticipantPreview` client
loader — the same pipeline the UNN-622 hover cards use, so hover cards for
inline encounter chips arrive free. No parallel embed loader, no second cache.

## Editor: the `embedBlocks` extension

App-side (`notes/_components/embed-blocks.ts`), modeled on the vendored
`image-blocks.ts` — a `StateField` emitting `Decoration.widget({ block: true,
side: 1 })` at the end of any line whose text is **exactly** one embed token
(trimmed, outside code). Mid-paragraph tokens do not embed.

**Lezer parses `![[…]]` as a reference-style `Image` node** (verified against
`@lezer/markdown` directly — the design doc's earlier "not an Image node"
assumption was wrong; only the *rendering* inertness holds, because CommonMark
renderers drop an image reference with no matching definition back to literal
text). Two consequences, both benign for v1:

- The vendored `image-blocks` regex requires `](url)`, so no image widget ever
  renders for a token — the embed card has the block slot to itself.
- The vendored `inline-preview` hides `Image` nodes on inactive lines, so a
  **mid-line** embed token (or an unsupported-kind embed) is *hidden* on
  inactive lines rather than showing `!` + pill; the raw token still reveals
  on the active line, and the display path degrades to `!` + pill correctly.
  This is the pre-existing vendored treatment of any `![foo]` reference-image
  text, accepted for v1 — not worth a fork or an upstream patch until it
  grates in practice.

Widget lifecycle mirrors the image precedent:

- **Inactive line**: a replace decoration hides the raw token but keeps the
  empty line at natural height (the image-blocks iOS momentum-scroll lesson —
  collapsing the line mid-scroll halts kinetic scrolling), with the card
  below.
- **Active line** (selection touches): no replace; the raw token reveals for
  editing. The app-side chip pill replace of the inner `[[…]]` sits *inside*
  the embed's outer replace — CM6 renders the outer one — and both use the
  same selection-touch reveal rule, so the two fields coexist without
  coordination and without vendored edits.
- **Card click navigates** to the target's console page (per AC) via the
  extension config's `navigate` — a deliberate divergence from `ImageWidget`'s
  caret-placing click; editing is reached through the revealed source line.
- v1 card is **DOM-built** (name, status line, count; loading skeleton;
  muted "Unknown …" miss state). The React-portal-in-widget upgrade and
  Ably-fed liveness are explicitly deferred.

## Display path: rewrite + claim + unwrap (decision 5)

`ChipProse` rewrites embed tokens **before** chip tokens. Ordering is
load-bearing: with encounter/dungeon as real kinds, the chip rewrite alone
would turn `![[encounter:e1|X]]` into `![X](#chip:…)` — a broken markdown
image. A regression test pins the ordering.

- Whole-line embed token → `![label](#embed:kind:id)` (native image syntax,
  parsed by remark unchanged); the `img` component claim renders `EmbedCard`.
- A `p` claim unwraps the paragraph when its only child is an embed — avoiding
  the invalid `<div>`-in-`<p>` nesting a block card claimed from inline
  position would create.
- Mid-paragraph embed tokens rewrite to the chip link form (inline pill),
  mirroring the editor's whole-line rule — the distinction is decided once, in
  the rewrite.

## Out of scope (pinned)

React-portal card, Ably liveness, npc/article cards, `/embed` slash sugar.
