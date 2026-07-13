"use client"

import { CaretDownIcon, HandHeartIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { NUMERIC_TIER_LABELS } from "@/domain/labels"
import { setNpcBondTierAction } from "@/lib/actions/campaign-world/bond"

const TIERS = [0, 1, 2, 3, 4] as const

/**
 * The DM's manual bond set/regress (UNN-581, D8) — rendered only once the NPC
 * holds a Lineage (bond machinery activates with one). The same CAS write as
 * the confirm surfaces, keyed on the loaded tier. Regressing interposes a
 * confirm that names the documented cost: every tier change restarts the
 * derived progress clock, so the activities behind the old tier never count
 * again — and in a gating-enabled campaign the dropped tiers re-close on the
 * party's next Atlas read (owned Archetypes stay owned).
 */
export function BondTierPicker({
  campaignId,
  entityId,
  npcName,
  tier,
}: {
  campaignId: string
  entityId: string
  npcName: string
  tier: number
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [pendingRegress, setPendingRegress] = useState<number | null>(null)

  const set = (next: number) =>
    startTransition(async () => {
      const result = await setNpcBondTierAction({
        campaignId,
        entityId,
        expectedTier: tier,
        tier: next,
      })
      if (!result.ok) {
        toast.error(
          result.error === "stale"
            ? "This bond already changed — refreshing."
            : "Couldn't set the bond. Try again."
        )
        if (result.error === "stale") router.refresh()
        return
      }
      toast.success(
        `${npcName}'s bond is now ${NUMERIC_TIER_LABELS[next]} (${next}).`
      )
    })

  const pick = (next: number) => {
    if (next === tier) return
    if (next < tier) setPendingRegress(next)
    else set(next)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <HandHeartIcon className="size-3.5 text-muted-foreground" />
          Bond · {NUMERIC_TIER_LABELS[tier]}
          {tier > 0 ? ` (${tier})` : null}
          <CaretDownIcon className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {TIERS.map((option) => (
            <DropdownMenuItem
              key={option}
              disabled={option === tier}
              onClick={() => pick(option)}
            >
              {NUMERIC_TIER_LABELS[option]}
              {option > 0 ? ` (${option})` : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {pendingRegress !== null ? (
        <AlertDialog open onOpenChange={() => setPendingRegress(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Lower {npcName}&apos;s bond to{" "}
                {NUMERIC_TIER_LABELS[pendingRegress]}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This restarts bond progress — the Collaborator activities behind
                the current tier never count again. If Lineage gating is on,
                tiers the bond had opened re-close for the party (Archetypes
                already unlocked stay unlocked).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  set(pendingRegress)
                  setPendingRegress(null)
                }}
              >
                Lower the bond
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}
