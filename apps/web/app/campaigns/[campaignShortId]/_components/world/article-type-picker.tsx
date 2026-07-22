"use client"

import { CaretDownIcon, TagIcon, XIcon } from "@phosphor-icons/react/dist/ssr"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { setArticleTypeAction } from "@/lib/actions/campaign-world/article-prose"
import { guardWriteTransition } from "@/lib/actions/guard-write-transition"

/**
 * The **custom Article-type picker** (§4): a curated list ∪ the campaign's
 * existing distinct values, with free text always winning — the column is a
 * label-only tag, never behavior. Typing something new offers "Use ⟨query⟩".
 */
export function ArticleTypePicker({
  campaignId,
  articleId,
  value,
  options,
}: {
  campaignId: string
  articleId: string
  value: string | null
  /** Curated suggestions ∪ the campaign's distinct types, deduped by the page. */
  options: string[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [, startTransition] = useTransition()

  const set = (type: string | null) =>
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await setArticleTypeAction({
            campaignId,
            articleId,
            type,
          })
          if (!result.ok) {
            toast.error("Couldn't set the type. Try again.")
            return
          }
          setOpen(false)
          setQuery("")
        },
        () => toast.error("Couldn't set the type. Try again.")
      )
    )

  const trimmed = query.trim()
  const isNew =
    trimmed !== "" &&
    !options.some((option) => option.toLowerCase() === trimmed.toLowerCase())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <TagIcon className="size-3.5 text-muted-foreground" />
        {value ?? "Set type"}
        <CaretDownIcon className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput
            placeholder="Type or pick…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>Type to create one.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => set(option)}
                >
                  {option}
                </CommandItem>
              ))}
              {isNew ? (
                <CommandItem
                  value={trimmed}
                  onSelect={() => set(trimmed)}
                  forceMount
                >
                  Use &ldquo;{trimmed}&rdquo;
                </CommandItem>
              ) : null}
              {value !== null ? (
                <CommandItem
                  value="__clear"
                  onSelect={() => set(null)}
                  forceMount
                >
                  <XIcon className="size-4" />
                  Clear type
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
