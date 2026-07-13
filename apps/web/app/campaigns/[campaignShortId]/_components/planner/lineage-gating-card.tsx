"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"

import { setLineageGatingAction } from "@/lib/actions/campaign/lineage-gating"

/**
 * Manage Campaign's "Lineage gating" section (UNN-581, D8): the per-campaign
 * opt-in that puts every placed character's Lineage Atlas behind the story
 * tier + NPC bonds. LWW boolean — flipped optimistically, reverted on error.
 */
export function LineageGatingCard({
  campaignId,
  lineageGating,
}: {
  campaignId: string
  lineageGating: boolean
}) {
  const [enabled, setEnabled] = useState(lineageGating)
  const [, startTransition] = useTransition()

  const toggle = (next: boolean) => {
    setEnabled(next)
    startTransition(async () => {
      const result = await setLineageGatingAction({
        campaignId,
        enabled: next,
      })
      if (!result.ok) {
        setEnabled(!next)
        toast.error("Couldn't update Lineage gating.")
        return
      }
      toast.success(
        next
          ? "Lineage gating is on — the Atlas now follows the story."
          : "Lineage gating is off — every Lineage is open."
      )
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lineage gating</CardTitle>
        <CardDescription>
          Gate the Lineage Atlas behind the campaign&apos;s story: characters
          reach their Origin Lineage at the story tier, and a
          Collaborator&apos;s Lineage opens for the whole party at their bond
          tier. Off, every Lineage is open as usual. Unlocking always spends
          Saved Ranks either way.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Switch
            id="lineage-gating"
            checked={enabled}
            onCheckedChange={toggle}
          />
          <Label htmlFor="lineage-gating">
            {enabled ? "Gating on" : "Gating off"}
          </Label>
        </div>
      </CardContent>
    </Card>
  )
}
