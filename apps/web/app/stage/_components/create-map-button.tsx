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

import { createMapAction } from "@/lib/actions/create-map"
import { stageMapPath } from "@/lib/paths"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

/**
 * "Create map" CTA on My Maps (UNN-460). Opens a dialog for the name, creates the
 * Map (owner = the caller), and routes to its editor — mirroring
 * {@link import("@/app/campaigns/_components/create-campaign-button").CreateCampaignButton}'s
 * action-then-redirect shape. The geometry starts empty; the editor autosaves
 * Zones into it (the canvas lands in UNN-461).
 */
export function CreateMapButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    const name = String(formData.get("name") ?? "")

    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await createMapAction({ name })
          if (!result.ok) {
            toast.error(
              "Couldn't create the map. Check the name and try again."
            )
            return
          }
          setOpen(false)
          router.push(stageMapPath(result.value.shortId))
        },
        () =>
          toast.error("Couldn't create the map. Check the name and try again.")
      )
    )
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon weight="bold" />
        Create map
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Create map</DialogTitle>
              <DialogDescription>
                Name your map. You can build out its zones once it&apos;s
                created.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-4">
              <Field>
                <FieldLabel htmlFor="map-name">Name</FieldLabel>
                <Input
                  id="map-name"
                  name="name"
                  required
                  maxLength={100}
                  autoFocus
                  placeholder="The Sunken Crypt"
                />
              </Field>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Spinner /> : null}
                Create map
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
