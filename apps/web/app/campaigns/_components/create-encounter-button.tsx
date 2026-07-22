"use client"

import { PlusIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { createEncounterAction } from "@/lib/actions/encounter/create"
import { guardWriteTransition } from "@/lib/actions/guard-write-transition"
import { encounterConsolePath } from "@/lib/paths"

/**
 * "New encounter" CTA on the campaign manage page (UNN-329). Opens a dialog for
 * the encounter name (+ optional notes), creates a `draft` encounter in the
 * campaign, and routes to its console (`/campaigns/{c}/encounter/{e}`) — the same
 * action-then-redirect shape the thin `/campaigns` entry used (UNN-335), now with
 * a name/notes form instead of a hardcoded name.
 */
export function CreateEncounterButton({
  campaignId,
  campaignShortId,
}: {
  campaignId: string
  campaignShortId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    const name = String(formData.get("name") ?? "")
    const notes = String(formData.get("notes") ?? "")

    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await createEncounterAction({
            campaignId,
            name,
            notes: notes || undefined,
          })
          if (!result.ok) {
            toast.error(
              "Couldn't create the encounter. Check the name and try again."
            )
            return
          }
          setOpen(false)
          router.push(
            encounterConsolePath(campaignShortId, result.value.shortId)
          )
        },
        () =>
          toast.error(
            "Couldn't create the encounter. Check the name and try again."
          )
      )
    )
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <PlusIcon weight="bold" />
        New encounter
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>New encounter</DialogTitle>
              <DialogDescription>
                Give the encounter a name. You&apos;ll build the combatant
                roster on the next screen.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-4">
              <Field>
                <FieldLabel htmlFor="encounter-name">Name</FieldLabel>
                <Input
                  id="encounter-name"
                  name="name"
                  required
                  maxLength={100}
                  autoFocus
                  placeholder="Ambush at the bridge"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="encounter-notes">
                  Notes{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </FieldLabel>
                <Textarea
                  id="encounter-notes"
                  name="notes"
                  maxLength={2000}
                  rows={3}
                  placeholder="Private DM notes for this encounter."
                />
              </Field>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Spinner /> : null}
                Create encounter
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
