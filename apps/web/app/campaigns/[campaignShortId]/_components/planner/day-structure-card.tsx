"use client"

import { PlusIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"

import { setSlotTemplateAction } from "@/lib/actions/campaign-clock/template"
import type { SlotTemplateEntry } from "@/lib/db/schema/campaign-clock"

/**
 * Manage Campaign's "Day structure" section (D1): edits the default-slots
 * template new days are born with. Forward-only — the copy says so — and
 * clock-structural, so the save rides the `clockVersion` CAS. Before the
 * clock starts there is nothing to edit; the card says where to start it.
 */
export function DayStructureCard({
  campaignId,
  clock,
}: {
  campaignId: string
  clock: { slotTemplate: SlotTemplateEntry[]; clockVersion: number } | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Day structure</CardTitle>
        <CardDescription>
          The time slots every new day starts with. Changes apply to days the
          clock hasn&apos;t reached yet — days already on the books keep their
          slots.
        </CardDescription>
      </CardHeader>
      {clock ? (
        <TemplateEditor campaignId={campaignId} clock={clock} />
      ) : (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Start the clock from the Day Runner first — the day structure
            becomes editable once time is running.
          </p>
        </CardContent>
      )}
    </Card>
  )
}

function TemplateEditor({
  campaignId,
  clock,
}: {
  campaignId: string
  clock: { slotTemplate: SlotTemplateEntry[]; clockVersion: number }
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [labels, setLabels] = useState(() =>
    clock.slotTemplate.map((entry) => entry.label)
  )

  const setLabel = (index: number, label: string) =>
    setLabels((current) =>
      current.map((existing, i) => (i === index ? label : existing))
    )

  const save = () => {
    const slotTemplate = labels
      .map((label) => ({ label: label.trim() }))
      .filter((entry) => entry.label.length > 0)
    if (slotTemplate.length === 0) {
      toast.error("A day needs at least one slot.")
      return
    }
    startTransition(async () => {
      const result = await setSlotTemplateAction({
        campaignId,
        slotTemplate,
        expectedVersion: clock.clockVersion,
      })
      if (!result.ok) {
        toast.error(
          result.error === "stale"
            ? "The clock moved under you — refresh and try again."
            : "Couldn't save the day structure."
        )
        if (result.error === "stale") router.refresh()
        return
      }
      setLabels(slotTemplate.map((entry) => entry.label))
      toast.success("Day structure saved — new days will use it.")
    })
  }

  return (
    <>
      <CardContent className="flex flex-col gap-2">
        {labels.map((label, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
              Slot {index + 1}
            </span>
            <Input
              value={label}
              maxLength={40}
              aria-label={`Slot ${index + 1} label`}
              onChange={(event) => setLabel(index, event.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove slot ${index + 1}`}
              disabled={labels.length === 1}
              onClick={() =>
                setLabels((current) => current.filter((_, i) => i !== index))
              }
            >
              <TrashIcon />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={labels.length >= 12}
          onClick={() => setLabels((current) => [...current, ""])}
        >
          <PlusIcon />
          Add slot
        </Button>
      </CardContent>
      <CardFooter>
        <Button onClick={save}>Save day structure</Button>
      </CardFooter>
    </>
  )
}
