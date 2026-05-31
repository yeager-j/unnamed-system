"use client"

import { CameraIcon } from "@phosphor-icons/react/dist/ssr"
import { useRef } from "react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Spinner } from "@workspace/ui/components/spinner"

import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import {
  removeCharacterPortraitAction,
  uploadCharacterPortraitAction,
} from "@/lib/actions/character-identity"
import {
  MAX_PORTRAIT_BYTES,
  messageForPortraitUploadError,
  PORTRAIT_ACCEPT,
} from "@/lib/storage/portrait-upload"
import { initials } from "@/lib/ui/initials"

/**
 * Owner-mode portrait control in the sheet header (UNN-224). Renders the same
 * avatar the public sheet shows, but as a {@link DropdownMenu} trigger:
 * clicking it offers Upload/Replace and (when a portrait is set) Remove. A
 * hover/focus camera overlay hints it's editable; while a write is in flight
 * the overlay shows a spinner and the trigger is disabled.
 *
 * Both writes go through {@link useCharacterWrite} on the `portrait` surface
 * with no optimistic `edit`: the uploaded Blob URL is only known server-side,
 * so the avatar repaints from `revalidateCharacter` — the same way the
 * builder's portrait area works. Client-side mime + size guards mirror the
 * server so the user gets fast feedback.
 */
export function EditablePortrait() {
  const character = useCharacter()
  const { portraitUrl, name } = character
  const { pending, write, characterId } = useCharacterWrite()
  const inputRef = useRef<HTMLInputElement>(null)

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

    write({
      surface: "portrait",
      action: (expectedVersion) => {
        const formData = new FormData()
        formData.append("characterId", characterId)
        formData.append("expectedVersion", String(expectedVersion))
        formData.append("file", file)
        return uploadCharacterPortraitAction(formData)
      },
      onError: (error) => {
        toast.error(messageForPortraitUploadError(error))
        return true
      },
    })
  }

  function onRemove() {
    write({
      surface: "portrait",
      action: (expectedVersion) =>
        removeCharacterPortraitAction({ characterId, expectedVersion }),
      messages: {
        stale: "Couldn't remove the portrait. Try again.",
        error: "Couldn't remove the portrait. Try again.",
      },
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending}
          aria-label="Edit portrait"
          className="group relative rounded-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Avatar className="size-20 rounded-none">
            <AvatarImage
              src={portraitUrl ?? undefined}
              alt={`${name}'s portrait`}
              className="rounded-none"
            />
            <AvatarFallback className="rounded-none text-lg">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[popup-open]:opacity-100">
            {pending ? <Spinner /> : <CameraIcon weight="bold" />}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => inputRef.current?.click()}>
            <CameraIcon weight="bold" />
            {portraitUrl ? "Replace portrait" : "Upload portrait"}
          </DropdownMenuItem>
          {portraitUrl ? (
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              Remove portrait
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={inputRef}
        type="file"
        accept={PORTRAIT_ACCEPT}
        className="sr-only"
        onChange={onFileSelected}
      />
    </>
  )
}
