"use client"

import { PlusIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useId, useState, useTransition } from "react"
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

import { MarkdownField } from "@/components/editor/markdown-field"
import { createCampaignAction } from "@/lib/actions/create-campaign"

/**
 * "Create campaign" CTA on My Campaigns (UNN-329). Opens a dialog for the name
 * (+ optional Markdown description), creates the campaign (DM = the caller), and
 * routes to its manage page — mirroring {@link CreateCharacterButton}'s
 * action-then-redirect shape, with a small form because a campaign needs a name
 * up front. The description uses the same {@link MarkdownField} editor as the
 * builder, so its prose round-trips with the public renderers; because that's a
 * controlled contenteditable (not a form input), it lives in local state rather
 * than `FormData`.
 */
export function CreateCampaignButton() {
  const router = useRouter()
  const descriptionLabelId = useId()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState("")
  const [isPending, startTransition] = useTransition()

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setDescription("")
  }

  function onSubmit(formData: FormData) {
    const name = String(formData.get("name") ?? "")
    const trimmedDescription = description.trim()

    startTransition(async () => {
      const result = await createCampaignAction({
        name,
        description: trimmedDescription || undefined,
      })
      if (!result.ok) {
        toast.error(
          "Couldn't create the campaign. Check the name and try again."
        )
        return
      }
      setOpen(false)
      router.push(`/campaigns/${result.value.shortId}`)
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon weight="bold" />
        Create campaign
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Create campaign</DialogTitle>
              <DialogDescription>
                Name your campaign. You can share a join link with players once
                it&apos;s created.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-4">
              <Field>
                <FieldLabel htmlFor="campaign-name">Name</FieldLabel>
                <Input
                  id="campaign-name"
                  name="name"
                  required
                  maxLength={100}
                  autoFocus
                  placeholder="The Sunless Reach"
                />
              </Field>
              <Field>
                <FieldLabel id={descriptionLabelId}>
                  Description{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </FieldLabel>
                <MarkdownField
                  ariaLabel="Campaign description"
                  ariaLabelledBy={descriptionLabelId}
                  value={description}
                  onChange={setDescription}
                  placeholder="A short pitch for your players."
                  className="[&_.ProseMirror]:min-h-24"
                />
              </Field>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Spinner /> : null}
                Create campaign
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
