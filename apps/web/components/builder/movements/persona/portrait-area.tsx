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

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import {
  removeCharacterPortraitAction,
  uploadCharacterPortraitAction,
} from "@/lib/actions/character-identity"
import { MAX_PORTRAIT_BYTES } from "@/lib/storage/portrait-upload"

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif"

/**
 * Movement 4's portrait area. Sits at the visual top of the page, larger
 * than the old basic-info portrait. When empty, renders a quiet cream
 * placeholder (no gradient) — the saturated avatar.vercel.sh service is
 * skipped entirely so the page doesn't compete with the name field for
 * attention. Once uploaded, the image fills the same circular frame.
 *
 * Upload pipeline matches the existing `PortraitUpload` widget:
 * `dispatchCharacterWriteWithRetry` keyed on `identityVersion`, silent
 * stale-retry, cross-tab broadcast. Client-side mime + size guards mirror
 * what the server enforces so the user gets fast feedback.
 */
export function PortraitArea({
  characterId,
  portraitUrl,
  identityVersion,
}: {
  characterId: string
  portraitUrl: string | null
  identityVersion: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const versionRef = useCharacterTokenRef(identityVersion)

  function openPicker() {
    inputRef.current?.click()
  }

  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (file.size > MAX_PORTRAIT_BYTES) {
      toast.error("That image is over 5 MB. Pick a smaller one.")
      return
    }
    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error("Portraits must be a JPEG, PNG, WebP, or GIF.")
      return
    }

    startTransition(async () => {
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "identity",
        versionRef,
        action: async (expectedVersion) => {
          const formData = new FormData()
          formData.append("characterId", characterId)
          formData.append("expectedVersion", String(expectedVersion))
          formData.append("file", file)
          return uploadCharacterPortraitAction(formData)
        },
      })
      if (!result.ok) {
        toast.error(messageForUploadError(result.error))
      }
    })
  }

  function onRemove() {
    startTransition(async () => {
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "identity",
        versionRef,
        action: (expectedVersion) =>
          removeCharacterPortraitAction({
            characterId,
            expectedVersion,
          }),
      })
      if (!result.ok) {
        toast.error("Couldn't remove the portrait. Try again.")
      }
    })
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
        accept={ACCEPT}
        className="sr-only"
        onChange={onFileSelected}
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openPicker}
          disabled={isPending}
        >
          {isPending ? <Spinner /> : <CameraIcon weight="bold" />}
          {portraitUrl ? "Replace" : "Upload portrait"}
        </Button>
        {portraitUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={isPending}
          >
            <TrashIcon weight="bold" />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function messageForUploadError(error: string): string {
  switch (error) {
    case "too-large":
      return "That image is over 5 MB. Pick a smaller one."
    case "invalid-mime":
      return "Portraits must be a JPEG, PNG, WebP, or GIF."
    case "empty-file":
      return "That file looks empty."
    case "stale":
      return "Couldn't sync — refresh to see the latest changes."
    case "character-not-found":
      return "This character was deleted. Head back to your roster."
    default:
      return "Couldn't upload. Try again."
  }
}
