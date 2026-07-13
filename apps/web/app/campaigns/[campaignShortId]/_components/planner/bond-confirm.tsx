"use client"

import { HandHeartIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { NUMERIC_TIER_LABELS } from "@/domain/labels"
import { BOND_THRESHOLD, MAX_BOND_TIER } from "@/domain/planner/bond"
import { setNpcBondTierAction } from "@/lib/actions/campaign-world/bond"

/** One NPC whose bond has enough Collaborator activity to deepen — the page
 *  derives these (D8's one-per-PC-per-day count) and both confirm surfaces
 *  render them. */
export interface BondConfirmEntry {
  npcId: string
  name: string
  currentTier: number
  nextTier: number
}

/** A Lineage-holding NPC's full bond-progress state — {@link BondConfirmEntry}
 *  plus the derived count, so surfaces can show "counted, 2/3" before the
 *  threshold and the confirm at it. */
export interface BondProgressEntry extends BondConfirmEntry {
  progress: number
  eligible: boolean
}

/**
 * The bond-advance confirm (UNN-581, D8/FR-14) — surfaced inline on a
 * Collaborator activity and in the Day-End feed; the app never auto-advances.
 * Deepen rides the `expectedTier` CAS, so confirming from two surfaces (or
 * two tabs) advances exactly once — the loser sees a stale toast and a
 * refresh. "Not yet" stores nothing: the parent hides the card for this
 * render, and it re-surfaces on the next Collaborator activity and at
 * Day-End.
 */
export function BondConfirmCard({
  campaignId,
  confirm,
  onNotYet,
}: {
  campaignId: string
  confirm: BondConfirmEntry
  onNotYet: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const nextLabel = NUMERIC_TIER_LABELS[confirm.nextTier]

  const deepen = () =>
    startTransition(async () => {
      const result = await setNpcBondTierAction({
        campaignId,
        entityId: confirm.npcId,
        expectedTier: confirm.currentTier,
        tier: confirm.nextTier,
      })
      if (!result.ok) {
        toast.error(
          result.error === "stale"
            ? "This bond already changed — refreshing."
            : "Couldn't deepen the bond. Try again."
        )
        if (result.error === "stale") router.refresh()
        return
      }
      toast.success(`The bond with ${confirm.name} deepens — ${nextLabel}.`)
    })

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gold/40 bg-gold/5 px-4 py-3">
      <HandHeartIcon aria-hidden className="size-5 shrink-0 text-gold" />
      <p className="min-w-0 flex-1 text-sm">
        The bond with <span className="font-medium">{confirm.name}</span> has
        grown — deepen to{" "}
        <span className="font-medium">
          {nextLabel} ({confirm.nextTier})
        </span>
        ?
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" onClick={deepen}>
          Deepen
        </Button>
        <Button variant="ghost" size="sm" onClick={onNotYet}>
          Not yet
        </Button>
      </div>
    </div>
  )
}

/**
 * The below-threshold sibling of {@link BondConfirmCard}: a quiet progress
 * line under a Collaborator activity, so the DM can tell "not eligible yet"
 * from "not counting at all". Shows the derived distinct-PC-days count
 * against the flat threshold (clamped for display — a backlog past the
 * threshold still reads n/n); a maxed bond states it instead of a count.
 * Deliberately not "this entry counted": an entry authored before the tier
 * last changed no longer does (D8's regress cost), and the running count is
 * the honest signal either way.
 */
export function BondProgressHint({ entry }: { entry: BondProgressEntry }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <HandHeartIcon aria-hidden className="size-3.5 shrink-0" />
      {entry.currentTier >= MAX_BOND_TIER ? (
        <>
          Bond with {entry.name} — {NUMERIC_TIER_LABELS[entry.currentTier]} (
          {entry.currentTier}), fully deepened.
        </>
      ) : (
        <>
          Bond with {entry.name} — {Math.min(entry.progress, BOND_THRESHOLD)}/
          {BOND_THRESHOLD} toward {NUMERIC_TIER_LABELS[entry.nextTier]} (
          {entry.nextTier}).
        </>
      )}
    </p>
  )
}
