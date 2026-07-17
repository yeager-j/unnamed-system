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

import { createTemplateSetAction } from "@/lib/actions/template-set/create"
import { stageSetPath } from "@/lib/paths"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

/**
 * "Create set" CTA on the Sets list (UNN-588). Opens a dialog for the name,
 * creates the empty Template Set (owner = the caller), and routes to its editor —
 * mirroring {@link import("./create-map-button").CreateMapButton}. Templates and
 * tables are authored in the editor, which autosaves them into the content blob.
 */
export function CreateSetButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    const name = String(formData.get("name") ?? "")

    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await createTemplateSetAction({ name })
          if (!result.ok) {
            toast.error(
              "Couldn't create the set. Check the name and try again."
            )
            return
          }
          setOpen(false)
          router.push(stageSetPath(result.value.shortId))
        },
        () =>
          toast.error("Couldn't create the set. Check the name and try again.")
      )
    )
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon weight="bold" />
        Create set
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Create template set</DialogTitle>
              <DialogDescription>
                Name your set. You can author its templates and tables once
                it&apos;s created.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-4">
              <Field>
                <FieldLabel htmlFor="set-name">Name</FieldLabel>
                <Input
                  id="set-name"
                  name="name"
                  required
                  maxLength={100}
                  autoFocus
                  placeholder="Haze-Choked Streets"
                />
              </Field>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Spinner /> : null}
                Create set
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
