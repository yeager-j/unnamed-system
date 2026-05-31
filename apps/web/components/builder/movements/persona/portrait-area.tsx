"use client"

import { CameraIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useRef } from "react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { useBuilderDraft, useBuilderWrite } from "@/hooks/use-builder-draft"
import {
  removeCharacterPortraitAction,
  uploadCharacterPortraitAction,
} from "@/lib/actions/character-identity"
import { MAX_PORTRAIT_BYTES } from "@/lib/storage/portrait-upload"

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif"

/**
 * Movement 4's portrait area. Sits at the visual top of the page. When
 * empty, renders a quiet cream placeholder (no gradient) — the saturated
 * avatar.vercel.sh service is skipped entirely so the page doesn't compete
 * with the name field for attention. Once uploaded, the image fills the
 * same circular frame.
 *
 * Upload pipeline: `dispatchCharacterWriteWithRetry` keyed on
 * `identityVersion`, silent stale-retry, cross-tab broadcast. Client-side
 * mime + size guards mirror what the server enforces so the user gets
 * fast feedback.
 */
export function PortraitArea() {
  const { id: characterId, portraitUrl } = useBuilderDraft()
  const { pending, write } = useBuilderWrite()
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
    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error("Portraits must be a JPEG, PNG, WebP, or GIF.")
      return
    }

    write({
      surface: "portrait",
      action: async (expectedVersion) => {
        const formData = new FormData()
        formData.append("characterId", characterId)
        formData.append("expectedVersion", String(expectedVersion))
        formData.append("file", file)
        return uploadCharacterPortraitAction(formData)
      },
      onError: (error) => {
        toast.error(messageForUploadError(error))
        return true
      },
    })
  }

  function onRemove() {
    write({
      surface: "portrait",
      action: (expectedVersion) =>
        removeCharacterPortraitAction({
          characterId,
          expectedVersion,
        }),
      messages: {
        stale: "Couldn't remove the portrait. Try again.",
        error: "Couldn't remove the portrait. Try again.",
      },
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

function messageForUploadError(error: string): string {
  switch (error) {
    case "too-large":
      return "That image is over 1 MB. Pick a smaller one."
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
