"use client"

import { CameraIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useRef, useTransition } from "react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { useLoadedCharacter } from "@/domain/entity/use-entity-write"
import { applyIdentityWriteAction } from "@/lib/actions/entity/mutations/apply-identity"
import { uploadEntityPortraitAction } from "@/lib/actions/entity/portrait"
import {
  MAX_PORTRAIT_BYTES,
  messageForPortraitUploadError,
  PORTRAIT_ACCEPT,
} from "@/lib/storage/portrait-upload"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

/**
 * Movement 4's portrait area. Sits at the visual top of the page. When
 * empty, renders a quiet cream placeholder (no gradient) — the saturated
 * avatar.vercel.sh service is skipped entirely so the page doesn't compete
 * with the name field for attention. Once uploaded, the image fills the
 * same circular frame.
 *
 * Upload pipeline (UNN-675): two stages, because a Headcanon authority handler is
 * rerunnable and must not perform the Blob write. `uploadEntityPortraitAction`
 * stores the file and returns its URL; the `portraitUrl` arm of `entity.identity`
 * then commits that URL on the identity axis. Removal is the same mutation with a
 * `null` value. Client-side mime + size guards mirror what the server enforces so
 * the user gets fast feedback.
 */
export function PortraitArea() {
  const { profile } = useLoadedCharacter()
  const portraitUrl = profile.portraitUrl
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function openPicker() {
    inputRef.current?.click()
  }

  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (file.size > MAX_PORTRAIT_BYTES) {
      toast.error("That image is over 1 MB. Pick a smaller one.")
      return
    }
    if (!PORTRAIT_ACCEPT.split(",").includes(file.type)) {
      toast.error("Portraits must be a JPEG, PNG, WebP, or GIF.")
      return
    }

    startTransition(() =>
      guardWriteTransition(
        async () => {
          const formData = new FormData()
          formData.append("entityId", profile.id)
          formData.append("file", file)

          const uploaded = await uploadEntityPortraitAction(formData)
          if (!uploaded.ok) {
            toast.error(messageForPortraitUploadError(uploaded.error))
            return
          }

          const committed = await setPortrait(uploaded.value.url)
          if (!committed.ok) {
            toast.error("Couldn't save the portrait. Try again.")
          }
        },
        () => toast.error("Couldn't upload the portrait. Try again.")
      )
    )
  }

  function setPortrait(url: string | null) {
    return applyIdentityWriteAction({
      entityId: profile.id,
      write: { field: "portraitUrl", value: url },
    })
  }

  function onRemove() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await setPortrait(null)
          if (result.ok) return
          toast.error("Couldn't remove the portrait. Try again.")
        },
        () => toast.error("Couldn't remove the portrait. Try again.")
      )
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Avatar className="size-40">
        <AvatarImage src={portraitUrl ?? undefined} alt="" />
        <AvatarFallback className="bg-muted" />
      </Avatar>

      <input
        ref={inputRef}
        type="file"
        accept={PORTRAIT_ACCEPT}
        className="sr-only"
        onChange={onFileSelected}
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openPicker}
          disabled={pending}
        >
          {pending ? <Spinner /> : <CameraIcon weight="bold" />}
          {portraitUrl ? "Replace" : "Upload portrait"}
        </Button>
        {portraitUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={pending}
          >
            <TrashIcon weight="bold" />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  )
}
